import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Customer,
    CustomerService,
    Product,
    RequestContext,
    TransactionalConnection,
    UserInputError,
    isGraphQlErrorResult,
} from '@vendure/core';

import { WishlistItem } from '../entities/wishlist-item.entity';

/**
 * Same identity model as patilandia-pets: a real logged-in session wins when there is one;
 * otherwise falls back to trusting a client-supplied email, but only for a guest with no
 * registered account. See PetProfileService for the full reasoning.
 */
@Injectable()
export class WishlistService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
    ) {}

    /** Admin API — every wishlist item, for support/context. No moderation concept, same as pets. */
    findAll(ctx: RequestContext): Promise<WishlistItem[]> {
        return this.connection
            .getRepository(ctx, WishlistItem)
            .find({ relations: ['customer', 'product'], order: { createdAt: 'DESC' } });
    }

    async findForCustomerEmail(ctx: RequestContext, email?: string | null): Promise<WishlistItem[]> {
        const customer = await this.resolveRequestingCustomer(ctx, email);
        if (!customer) {
            return [];
        }
        return this.findForCustomer(ctx, customer.id);
    }

    private findForCustomer(ctx: RequestContext, customerId: ID): Promise<WishlistItem[]> {
        return this.connection.getRepository(ctx, WishlistItem).find({
            where: { customer: { id: customerId } },
            relations: ['product', 'customer'],
            order: { createdAt: 'ASC' },
        });
    }

    /** Idempotent — adding a product already in the wishlist just returns the existing row. */
    async add(ctx: RequestContext, email: string | undefined | null, productId: ID): Promise<WishlistItem> {
        const customer = await this.resolveOrCreateRequestingCustomer(ctx, email);
        const product = await this.connection.getEntityOrThrow(ctx, Product, productId, {
            channelId: ctx.channelId,
        });

        const existing = await this.connection.getRepository(ctx, WishlistItem).findOne({
            where: { customer: { id: customer.id }, product: { id: product.id } },
            relations: ['product', 'customer'],
        });
        if (existing) {
            return existing;
        }

        const item = new WishlistItem({ customer, product });
        return this.connection.getRepository(ctx, WishlistItem).save(item);
    }

    /** Idempotent — removing a product that isn't there (or a customer that doesn't exist yet) is a no-op. */
    async remove(ctx: RequestContext, email: string | undefined | null, productId: ID): Promise<void> {
        const customer = await this.resolveRequestingCustomer(ctx, email);
        if (!customer) {
            return;
        }
        const item = await this.connection.getRepository(ctx, WishlistItem).findOne({
            where: { customer: { id: customer.id }, product: { id: productId } },
        });
        if (item) {
            await this.connection.getRepository(ctx, WishlistItem).remove(item);
        }
    }

    /**
     * Merges a locally-held list of product ids into the real wishlist for this email — used the
     * moment an email becomes known (checkout, or the Mascotas email gate) to push up whatever was
     * saved anonymously in localStorage, without dropping anything already stored server-side
     * (e.g. from a previous visit on another device). Never removes anything; only adds what's missing.
     */
    async sync(ctx: RequestContext, email: string | undefined | null, productIds: ID[]): Promise<WishlistItem[]> {
        const customer = await this.resolveOrCreateRequestingCustomer(ctx, email);
        const existing = await this.connection.getRepository(ctx, WishlistItem).find({
            where: { customer: { id: customer.id } },
            relations: ['product'],
        });
        const existingProductIds = new Set(existing.map(item => item.product.id.toString()));
        const missingIds = productIds.filter(id => !existingProductIds.has(id.toString()));

        for (const productId of missingIds) {
            try {
                const product = await this.connection.getEntityOrThrow(ctx, Product, productId, {
                    channelId: ctx.channelId,
                });
                await this.connection.getRepository(ctx, WishlistItem).save(new WishlistItem({ customer, product }));
            } catch {
                // The id came from localStorage and no longer resolves to a real product —
                // skip it instead of failing the whole sync over stale local data.
            }
        }

        return this.findForCustomer(ctx, customer.id);
    }

    /** Admin-only cleanup — no ownership check, gated by Permission.DeleteCustomer instead. */
    async adminRemove(ctx: RequestContext, id: ID): Promise<void> {
        const item = await this.connection.getEntityOrThrow(ctx, WishlistItem, id);
        await this.connection.getRepository(ctx, WishlistItem).remove(item);
    }

    private findCustomerByEmail(ctx: RequestContext, email: string): Promise<Customer | null> {
        return this.connection.getRepository(ctx, Customer).findOne({ where: { emailAddress: email } });
    }

    /** See PetProfileService.resolveRequestingCustomer for the full reasoning — identical shape. */
    private async resolveRequestingCustomer(ctx: RequestContext, clientEmail?: string | null): Promise<Customer | null> {
        if (ctx.activeUserId) {
            return (await this.customerService.findOneByUserId(ctx, ctx.activeUserId)) ?? null;
        }
        if (!clientEmail) return null;
        const customer = await this.findCustomerByEmail(ctx, clientEmail);
        if (customer?.user) return null;
        return customer;
    }

    /** See PetProfileService.resolveOrCreateRequestingCustomer — identical shape. */
    private async resolveOrCreateRequestingCustomer(ctx: RequestContext, clientEmail?: string | null): Promise<Customer> {
        if (ctx.activeUserId) {
            const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
            if (!customer) {
                throw new UserInputError('No se encontró un cliente asociado a esta sesión');
            }
            return customer;
        }
        if (!clientEmail) {
            throw new UserInputError('Se requiere iniciar sesión o indicar un correo');
        }
        const existing = await this.findCustomerByEmail(ctx, clientEmail);
        if (existing?.user) {
            throw new UserInputError('Ya existe una cuenta con este correo — iniciá sesión para continuar');
        }
        const customer = await this.customerService.createOrUpdate(ctx, {
            emailAddress: clientEmail,
            firstName: clientEmail.split('@')[0] || 'Cliente',
            lastName: '',
        });
        if (isGraphQlErrorResult(customer)) {
            throw new UserInputError(customer.message);
        }
        return customer;
    }
}
