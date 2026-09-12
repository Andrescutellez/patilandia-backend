import { Injectable, Inject } from '@nestjs/common';
import { ID, PaginatedList } from '@vendure/common/lib/shared-types';
import {
    EventBus,
    ListQueryBuilder,
    ListQueryOptions,
    Product,
    ProductService,
    RelationPaths,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

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

    /** Shop API — a customer submitting a review. Starts unapproved; a moderator has to publish it. */
    async submit(ctx: RequestContext, input: SubmitProductReviewInput): Promise<ProductReview> {
        if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
            throw new UserInputError('La calificación debe ser un número entero entre 1 y 5');
        }

        const product = await this.connection.getEntityOrThrow(ctx, Product, input.productId, {
            channelId: ctx.channelId,
        });

        const review = new ProductReview({
            product,
            authorName: input.authorName.trim(),
            authorEmail: input.authorEmail.trim(),
            rating: input.rating,
            title: input.title.trim(),
            body: input.body.trim(),
            approved: false,
        });
        return this.connection.getRepository(ctx, ProductReview).save(review);
    }

    /** Admin API — approve or reject a pending review. Approving/un-approving recomputes the
     *  product's aggregate rating (Product.customFields.rating/reviewCount), which is the same
     *  field the storefront and the SEO structured data already read — no other code had to
     *  change to start showing real numbers instead of the placeholder ones from the seed. */
    async setApproved(ctx: RequestContext, id: ID, approved: boolean): Promise<ProductReview> {
        const review = await this.connection.getEntityOrThrow(ctx, ProductReview, id, {
            relations: ['product'],
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
