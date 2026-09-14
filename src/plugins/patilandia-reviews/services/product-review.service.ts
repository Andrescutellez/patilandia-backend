import { Injectable, Inject } from '@nestjs/common';
import { ID, PaginatedList } from '@vendure/common/lib/shared-types';
import {
    Customer,
    CustomerService,
    EventBus,
    ListQueryBuilder,
    ListQueryOptions,
    Order,
    Product,
    ProductService,
    RelationPaths,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

// Same code the storefront's checkout uses for the "pagás al recibir" payment method (see
// patilandia-loyalty/constants.ts and patilandia's shop-client.ts for the other two copies of this
// literal) — kept as its own local copy rather than importing patilandia-loyalty, so Reviews stays
// usable on its own even without the loyalty plugin installed.
const CASH_ON_DELIVERY_PAYMENT_METHOD_CODE = 'cash-on-delivery';

import { ProductReview } from '../entities/product-review.entity';
import { PATILANDIA_REVIEWS_PLUGIN_OPTIONS } from '../constants';
import { ProductReviewApprovedEvent } from '../events/product-review-approved-event';
import { PluginInitOptions } from '../types';

export interface SubmitProductReviewInput {
    productId: ID;
    authorName: string;
    authorEmail: string;
    rating: number;
    title: string;
    body: string;
}

@Injectable()
export class ProductReviewService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private productService: ProductService,
        private customerService: CustomerService,
        private eventBus: EventBus,
        @Inject(PATILANDIA_REVIEWS_PLUGIN_OPTIONS) private options: PluginInitOptions,
    ) {}

    /** Shop API — only the reviews a moderator has approved, for a single product. */
    findApprovedForProduct(
        ctx: RequestContext,
        productId: ID,
        options?: ListQueryOptions<ProductReview>,
    ): Promise<PaginatedList<ProductReview>> {
        return this.listQueryBuilder
            .build(ProductReview, options, { relations: ['product'], ctx })
            .andWhere('productreview.productId = :productId', { productId })
            .andWhere('productreview.approved = :approved', { approved: true })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }

    /** Admin API — every review regardless of moderation status, for the moderation queue. */
    findAll(
        ctx: RequestContext,
        options?: ListQueryOptions<ProductReview>,
        relations?: RelationPaths<ProductReview>,
    ): Promise<PaginatedList<ProductReview>> {
        return this.listQueryBuilder
            .build(ProductReview, options, { relations: relations ?? ['product'], ctx })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }

    findOne(ctx: RequestContext, id: ID): Promise<ProductReview | null> {
        return this.connection
            .getRepository(ctx, ProductReview)
            .findOne({ where: { id }, relations: ['product'] });
    }

    /**
     * Shop API — a customer submitting a review. Starts unapproved; a moderator has to publish it.
     * Resolves who's actually submitting (real session first, else an existing Customer for the
     * given email — never creating one just for a review) and requires a verified purchase of THIS
     * product before the review is even accepted — commenting on something you never bought isn't
     * a real review, so this is rejected up front rather than silently accepted-but-unrewarded.
     * A customer we can identify can't leave a second review for the same product either.
     */
    async submit(ctx: RequestContext, input: SubmitProductReviewInput): Promise<ProductReview> {
        if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
            throw new UserInputError('La calificación debe ser un número entero entre 1 y 5');
        }

        const product = await this.connection.getEntityOrThrow(ctx, Product, input.productId, {
            channelId: ctx.channelId,
        });

        const customer = await this.resolveReviewerCustomer(ctx, input.authorEmail.trim());
        if (!customer) {
            throw new UserInputError(
                'Necesitás haber comprado este producto para reseñarlo. Si ya lo compraste, iniciá sesión o usá el mismo correo de tu pedido.',
            );
        }

        const verifiedPurchase = await this.hasVerifiedPurchase(ctx, customer.id, product.id);
        if (!verifiedPurchase) {
            throw new UserInputError('Solo podés reseñar productos que hayas comprado.');
        }

        const existing = await this.connection.getRepository(ctx, ProductReview).findOne({
            where: { product: { id: product.id }, customer: { id: customer.id } },
        });
        if (existing) {
            throw new UserInputError('Ya dejaste una reseña de este producto.');
        }

        const review = new ProductReview({
            product,
            customer,
            authorName: input.authorName.trim(),
            authorEmail: input.authorEmail.trim(),
            rating: input.rating,
            title: input.title.trim(),
            body: input.body.trim(),
            approved: false,
        });
        return this.connection.getRepository(ctx, ProductReview).save(review);
    }

    /** Same identity rule as PetProfileService.resolveRequestingCustomer: a real logged-in session
     *  always wins; otherwise only an EXISTING Customer for this email counts (never created here),
     *  and a registered account can no longer be claimed by a bare email string once it has a
     *  password (`customer.user` is eager-loaded, free to check). */
    private async resolveReviewerCustomer(ctx: RequestContext, authorEmail: string): Promise<Customer | null> {
        if (ctx.activeUserId) {
            return (await this.customerService.findOneByUserId(ctx, ctx.activeUserId)) ?? null;
        }
        const customer = await this.connection
            .getRepository(ctx, Customer)
            .findOne({ where: { emailAddress: authorEmail } });
        if (customer?.user) return null;
        return customer;
    }

    /** Same definition of "genuinely bought it" as LoyaltyService.hasVerifiedPurchase (duplicated
     *  rather than importing patilandia-loyalty — see the constant above for why): prepaid counts
     *  as soon as the order is placed, cash-on-delivery only once actually Delivered, since
     *  PaymentAuthorized alone doesn't mean the money is secured yet on a COD order. */
    private async hasVerifiedPurchase(ctx: RequestContext, customerId: ID, productId: ID): Promise<boolean> {
        const orders = await this.connection
            .getRepository(ctx, Order)
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.lines', 'line')
            .leftJoinAndSelect('line.productVariant', 'variant')
            .leftJoinAndSelect('order.payments', 'payment')
            .where('order.customerId = :customerId', { customerId })
            .andWhere('variant.productId = :productId', { productId })
            .getMany();
        return orders.some(order => this.isOrderCompleted(order));
    }

    private isOrderCompleted(order: Order): boolean {
        if (order.state === 'Cancelled') return false;
        const isCod = order.payments?.some(payment => payment.method === CASH_ON_DELIVERY_PAYMENT_METHOD_CODE) ?? false;
        return isCod ? order.state === 'Delivered' : order.active === false;
    }

    /** Admin API — approve or reject a pending review. Approving/un-approving recomputes the
     *  product's aggregate rating (Product.customFields.rating/reviewCount), which is the same
     *  field the storefront and the SEO structured data already read — no other code had to
     *  change to start showing real numbers instead of the placeholder ones from the seed. */
    async setApproved(ctx: RequestContext, id: ID, approved: boolean): Promise<ProductReview> {
        const review = await this.connection.getEntityOrThrow(ctx, ProductReview, id, {
            relations: ['product', 'customer'],
        });
        const wasApproved = review.approved;
        review.approved = approved;
        await this.connection.getRepository(ctx, ProductReview).save(review);
        await this.recomputeAggregate(ctx, review.product.id);
        if (!wasApproved && approved) {
            await this.eventBus.publish(new ProductReviewApprovedEvent(ctx, review));
        }
        return this.findOne(ctx, id) as Promise<ProductReview>;
    }

    async delete(ctx: RequestContext, id: ID): Promise<void> {
        const review = await this.connection.getEntityOrThrow(ctx, ProductReview, id, {
            relations: ['product'],
        });
        const productId = review.product.id;
        await this.connection.getRepository(ctx, ProductReview).remove(review);
        await this.recomputeAggregate(ctx, productId);
    }

    private async recomputeAggregate(ctx: RequestContext, productId: ID): Promise<void> {
        const raw = await this.connection
            .getRepository(ctx, ProductReview)
            .createQueryBuilder('review')
            .select('AVG(review.rating)', 'avgRating')
            .addSelect('COUNT(review.id)', 'count')
            .where('review.productId = :productId', { productId })
            .andWhere('review.approved = :approved', { approved: true })
            .getRawOne<{ avgRating: string | null; count: string }>();

        await this.productService.update(ctx, {
            id: productId,
            customFields: {
                rating: raw?.avgRating ? Math.round(Number(raw.avgRating) * 10) / 10 : 0,
                reviewCount: raw?.count ? Number(raw.count) : 0,
            },
        });
    }
}
