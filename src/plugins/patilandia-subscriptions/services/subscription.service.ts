import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Address,
    Customer,
    CustomerService,
    ProductVariant,
    RequestContext,
    TransactionalConnection,
    TranslatorService,
    UserInputError,
} from '@vendure/core';
import { IsNull, LessThanOrEqual } from 'typeorm';

import { SUBSCRIPTION_FREQUENCIES_DAYS } from '../constants';
import { ProductSubscription } from '../entities/product-subscription.entity';

export interface NewSubscriptionAddressInput {
    fullName: string;
    streetLine1: string;
    streetLine2?: string;
    city: string;
    province?: string;
    postalCode?: string;
    countryCode: string;
    phoneNumber?: string;
    neighborhood?: string;
    deliveryNotes?: string;
}

export interface CreateSubscriptionInput {
    productVariantId: ID;
    quantity: number;
    frequencyDays: number;
    /** One of these two must be given: reuse a saved address, or save a brand-new one. */
    addressId?: ID | null;
    newAddress?: NewSubscriptionAddressInput | null;
}

export interface UpdateSubscriptionAddressInput {
    id: ID;
    addressId?: ID | null;
    newAddress?: NewSubscriptionAddressInput | null;
}

const SUBSCRIPTION_RELATIONS = ['customer', 'productVariant', 'productVariant.product', 'shippingAddress'];

/**
 * MVP scope, explicitly requested by the user: this never charges anything on its own. It only
 * schedules a future repurchase — the actual payment always goes through the exact same checkout
 * flow as any other order (see the storefront's subscriptions-client.ts "buyNow", which just calls
 * the existing addItemToOrder/setShippingAddress/placeOrder, nothing new).
 */
@Injectable()
export class SubscriptionService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private translator: TranslatorService,
    ) {}

    /**
     * Subscriptions require a real logged-in account, not a guest checkout identity — this isn't
     * an arbitrary restriction, it falls out of two things confirmed against the real Vendure
     * server: the customer's own address book (`CustomerService.createAddress`, needed so the
     * subscription's address survives longer than a single order) requires `ctx.activeUserId`
     * exactly like Vendure's own native `createCustomerAddress` mutation does, and the user's own
     * spec calls for managing this "from your account", which a guest doesn't durably have.
     */
    private async resolveOwnerCustomer(ctx: RequestContext): Promise<Customer> {
        if (!ctx.activeUserId) {
            throw new UserInputError('Necesitás iniciar sesión para crear una recompra programada');
        }
        const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
        if (!customer) {
            throw new UserInputError('No se encontró un cliente asociado a esta sesión');
        }
        return customer;
    }

    private validateFrequency(frequencyDays: number): void {
        if (!SUBSCRIPTION_FREQUENCIES_DAYS.includes(frequencyDays as (typeof SUBSCRIPTION_FREQUENCIES_DAYS)[number])) {
            throw new UserInputError(
                `La frecuencia debe ser una de: ${SUBSCRIPTION_FREQUENCIES_DAYS.join(', ')} días`,
            );
        }
    }

    /** Never trusts the client on whether a product is repurchasable — same principle as
     *  Personalización's price strategy re-checking its own config server-side. */
    private async loadRepurchasableVariant(ctx: RequestContext, productVariantId: ID): Promise<ProductVariant> {
        const variant = await this.connection.getRepository(ctx, ProductVariant).findOne({
            where: { id: productVariantId },
            relations: ['product'],
        });
        if (!variant) {
            throw new UserInputError('Variante no encontrada');
        }
        // Vendure's static CustomProductFields type isn't augmented in this project (customFields
        // are declared once, dynamically, in vendure-config.ts) — same narrow inline cast already
        // used in event-subscribers.ts for OrderLine.customFields.subscriptionId.
        const customFields = variant.product?.customFields as { repurchaseEnabled?: boolean } | undefined;
        if (!customFields?.repurchaseEnabled) {
            throw new UserInputError('Este producto no admite recompra programada');
        }
        return variant;
    }

    private async resolveAddress(
        ctx: RequestContext,
        customer: Customer,
        addressId?: ID | null,
        newAddress?: NewSubscriptionAddressInput | null,
    ): Promise<Address> {
        if (addressId) {
            const address = await this.connection.getRepository(ctx, Address).findOne({
                where: { id: addressId },
                relations: ['customer'],
            });
            if (!address || address.customer?.id !== customer.id) {
                throw new UserInputError('Dirección no encontrada');
            }
            return address;
        }
        if (!newAddress) {
            throw new UserInputError('Se requiere una dirección (existente o nueva) para la suscripción');
        }
        if (!newAddress.fullName.trim() || !newAddress.streetLine1.trim() || !newAddress.city.trim()) {
            throw new UserInputError('La dirección necesita nombre, dirección y ciudad');
        }
        // Reuses Vendure's own CustomerService.createAddress — the exact method backing the native
        // createCustomerAddress Shop API mutation — so a new subscription address is saved into the
        // customer's real address book, not a copy this plugin owns.
        return this.customerService.createAddress(ctx, customer.id, {
            fullName: newAddress.fullName.trim(),
            streetLine1: newAddress.streetLine1.trim(),
            streetLine2: newAddress.streetLine2?.trim(),
            city: newAddress.city.trim(),
            province: newAddress.province?.trim(),
            postalCode: newAddress.postalCode?.trim(),
            countryCode: newAddress.countryCode,
            phoneNumber: newAddress.phoneNumber?.trim(),
            customFields: {
                neighborhood: newAddress.neighborhood?.trim() || undefined,
                deliveryNotes: newAddress.deliveryNotes?.trim() || undefined,
            },
        });
    }

    async create(ctx: RequestContext, input: CreateSubscriptionInput): Promise<ProductSubscription> {
        if (input.quantity < 1) {
            throw new UserInputError('La cantidad debe ser al menos 1');
        }
        this.validateFrequency(input.frequencyDays);

        const customer = await this.resolveOwnerCustomer(ctx);
        const variant = await this.loadRepurchasableVariant(ctx, input.productVariantId);
        const address = await this.resolveAddress(ctx, customer, input.addressId, input.newAddress);

        const nextRenewalDate = new Date();
        nextRenewalDate.setDate(nextRenewalDate.getDate() + input.frequencyDays);

        const subscription = new ProductSubscription({
            customer,
            productVariant: variant,
            shippingAddress: address,
            quantity: input.quantity,
            frequencyDays: input.frequencyDays,
            status: 'ACTIVE',
            nextRenewalDate,
            reminderSentAt: null,
        });
        return this.connection.getRepository(ctx, ProductSubscription).save(subscription);
    }

    async findMine(ctx: RequestContext): Promise<ProductSubscription[]> {
        const customer = await this.resolveOwnerCustomer(ctx);
        return this.connection.getRepository(ctx, ProductSubscription).find({
            where: { customer: { id: customer.id } },
            relations: SUBSCRIPTION_RELATIONS,
            order: { createdAt: 'DESC' },
        });
    }

    private async getOwnedSubscription(ctx: RequestContext, id: ID): Promise<ProductSubscription> {
        const customer = await this.resolveOwnerCustomer(ctx);
        const subscription = await this.connection.getRepository(ctx, ProductSubscription).findOne({
            where: { id },
            relations: SUBSCRIPTION_RELATIONS,
        });
        if (!subscription || subscription.customer.id !== customer.id) {
            throw new UserInputError('Suscripción no encontrada');
        }
        return subscription;
    }

    async pause(ctx: RequestContext, id: ID): Promise<ProductSubscription> {
        const subscription = await this.getOwnedSubscription(ctx, id);
        if (subscription.status === 'CANCELLED') {
            throw new UserInputError('No se puede pausar una suscripción cancelada');
        }
        subscription.status = 'PAUSED';
        return this.connection.getRepository(ctx, ProductSubscription).save(subscription);
    }

    async resume(ctx: RequestContext, id: ID): Promise<ProductSubscription> {
        const subscription = await this.getOwnedSubscription(ctx, id);
        if (subscription.status === 'CANCELLED') {
            throw new UserInputError('No se puede reanudar una suscripción cancelada');
        }
        subscription.status = 'ACTIVE';
        return this.connection.getRepository(ctx, ProductSubscription).save(subscription);
    }

    async cancel(ctx: RequestContext, id: ID): Promise<ProductSubscription> {
        const subscription = await this.getOwnedSubscription(ctx, id);
        subscription.status = 'CANCELLED';
        return this.connection.getRepository(ctx, ProductSubscription).save(subscription);
    }

    /** Changing the cadence only applies going forward — it deliberately does not recompute
     *  nextRenewalDate, so the cycle already in motion isn't yanked around by an edit. */
    async updateFrequency(ctx: RequestContext, id: ID, frequencyDays: number): Promise<ProductSubscription> {
        this.validateFrequency(frequencyDays);
        const subscription = await this.getOwnedSubscription(ctx, id);
        subscription.frequencyDays = frequencyDays;
        return this.connection.getRepository(ctx, ProductSubscription).save(subscription);
    }

    async updateQuantity(ctx: RequestContext, id: ID, quantity: number): Promise<ProductSubscription> {
        if (quantity < 1) {
            throw new UserInputError('La cantidad debe ser al menos 1');
        }
        const subscription = await this.getOwnedSubscription(ctx, id);
        subscription.quantity = quantity;
        return this.connection.getRepository(ctx, ProductSubscription).save(subscription);
    }

    async updateAddress(ctx: RequestContext, input: UpdateSubscriptionAddressInput): Promise<ProductSubscription> {
        const subscription = await this.getOwnedSubscription(ctx, input.id);
        const customer = await this.resolveOwnerCustomer(ctx);
        subscription.shippingAddress = await this.resolveAddress(ctx, customer, input.addressId, input.newAddress);
        return this.connection.getRepository(ctx, ProductSubscription).save(subscription);
    }

    /**
     * The single, documented rule for the next renewal date: anchored to the moment the repurchase
     * actually completed, not to the old scheduled date. A customer who buys late doesn't inherit
     * any backlog — their next reminder is simply `anchorDate + frequencyDays` from today, not from
     * whenever the original schedule said it "should" have happened.
     *
     * Only acts on a subscription that's still ACTIVE — if it was paused or cancelled after the
     * "Comprar ahora" order was placed but before payment cleared, this is a silent no-op.
     */
    async markRenewedFromOrder(ctx: RequestContext, subscriptionId: ID, anchorDate: Date): Promise<void> {
        const subscription = await this.connection.getRepository(ctx, ProductSubscription).findOne({
            where: { id: subscriptionId },
        });
        if (!subscription || subscription.status !== 'ACTIVE') return;

        const nextRenewalDate = new Date(anchorDate);
        nextRenewalDate.setDate(nextRenewalDate.getDate() + subscription.frequencyDays);
        subscription.nextRenewalDate = nextRenewalDate;
        subscription.reminderSentAt = null;
        await this.connection.getRepository(ctx, ProductSubscription).save(subscription);
    }

    /** Used by the daily scheduled task — see scheduled-tasks/subscription-reminder.task.ts. Loads
     *  `productVariant.product.translations` (not just `.product`) because Product.name is a
     *  translatable field with no plain column of its own — see getProductName below for why a raw
     *  property read isn't enough outside of GraphQL's own field resolution. */
    findDueForReminder(ctx: RequestContext): Promise<ProductSubscription[]> {
        return this.connection.getRepository(ctx, ProductSubscription).find({
            where: {
                status: 'ACTIVE',
                nextRenewalDate: LessThanOrEqual(new Date()),
                reminderSentAt: IsNull(),
            },
            relations: ['customer', 'productVariant', 'productVariant.product', 'productVariant.product.translations'],
        });
    }

    /**
     * Product.name has no plain column — it lives in ProductTranslation, and is normally resolved
     * for free by GraphQL's own field resolver on the Product type. That resolver never runs for a
     * plain TypeScript property read (e.g. `subscription.productVariant.product.name` inside the
     * scheduled task, outside any GraphQL response) — confirmed against the real server: it came
     * back `undefined`, breaking the reminder email's subject line. TranslatorService is Vendure's
     * own supported way to get the same value from backend code.
     */
    getProductName(ctx: RequestContext, subscription: ProductSubscription): string {
        return this.translator.translate(subscription.productVariant.product, ctx).name;
    }

    async markReminderSent(ctx: RequestContext, id: ID): Promise<void> {
        await this.connection.getRepository(ctx, ProductSubscription).update(id, {
            reminderSentAt: new Date(),
        });
    }

    // -----------------------------------------------------------------------------------------
    // Admin API
    // -----------------------------------------------------------------------------------------

    async findAllAdmin(
        ctx: RequestContext,
        options?: { status?: string | null; search?: string | null },
    ): Promise<ProductSubscription[]> {
        const qb = this.connection
            .getRepository(ctx, ProductSubscription)
            .createQueryBuilder('subscription')
            .leftJoinAndSelect('subscription.customer', 'customer')
            .leftJoinAndSelect('subscription.productVariant', 'productVariant')
            .leftJoinAndSelect('productVariant.product', 'product')
            .leftJoinAndSelect('subscription.shippingAddress', 'shippingAddress')
            // Product.name has no plain column — it's translatable, stored in ProductTranslation —
            // same root cause as the reminder email bug fixed above. A plain `product.name` in raw
            // SQL fails outright ("column product.name does not exist"), confirmed against the real
            // server; joining the translations table is the only way to filter by it here.
            .leftJoin('product.translations', 'productTranslation')
            .orderBy('subscription.createdAt', 'DESC');

        if (options?.status) {
            qb.andWhere('subscription.status = :status', { status: options.status });
        }
        if (options?.search) {
            const search = `%${options.search}%`;
            qb.andWhere(
                '(customer.firstName ILIKE :search OR customer.lastName ILIKE :search OR customer.emailAddress ILIKE :search OR productTranslation.name ILIKE :search)',
                { search },
            );
        }
        return qb.getMany();
    }

    async adminCancel(ctx: RequestContext, id: ID): Promise<ProductSubscription> {
        const subscription = await this.connection.getEntityOrThrow(ctx, ProductSubscription, id);
        subscription.status = 'CANCELLED';
        return this.connection.getRepository(ctx, ProductSubscription).save(subscription);
    }
}
