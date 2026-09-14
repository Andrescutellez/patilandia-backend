import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { ProductVariant, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';

import { SOURCING_TYPES, SourcingType } from '../constants';
import { SupplierProductVariant } from '../entities/supplier-product-variant.entity';
import { Supplier } from '../entities/supplier.entity';

export interface SupplierInput {
    name: string;
    contactName?: string;
    phone?: string;
    whatsapp?: string;
    email?: string;
    address?: string;
    notes?: string;
    active?: boolean;
}

export interface SupplierProductVariantInput {
    supplierId: ID;
    productVariantId: ID;
    supplierSku?: string;
    sourcingType: SourcingType;
    currentCostMinorUnits?: number;
}

const SUPPLIER_RELATIONS = ['productVariants', 'productVariants.productVariant', 'productVariants.productVariant.product'];

@Injectable()
export class SupplierService {
    constructor(private connection: TransactionalConnection) {}

    findAll(ctx: RequestContext): Promise<Supplier[]> {
        return this.connection.getRepository(ctx, Supplier).find({ order: { name: 'ASC' } });
    }

    findOne(ctx: RequestContext, id: ID): Promise<Supplier | null> {
        return this.connection.getRepository(ctx, Supplier).findOne({ where: { id }, relations: SUPPLIER_RELATIONS });
    }

    async create(ctx: RequestContext, input: SupplierInput): Promise<Supplier> {
        if (!input.name.trim()) {
            throw new UserInputError('El nombre del proveedor es obligatorio');
        }
        const supplier = new Supplier({
            name: input.name.trim(),
            contactName: input.contactName?.trim() ?? '',
            phone: input.phone?.trim() ?? '',
            whatsapp: input.whatsapp?.trim() ?? '',
            email: input.email?.trim() ?? '',
            address: input.address?.trim() ?? '',
            notes: input.notes?.trim() ?? '',
            active: input.active ?? true,
        });
        return this.connection.getRepository(ctx, Supplier).save(supplier);
    }

    async update(ctx: RequestContext, id: ID, input: Partial<SupplierInput>): Promise<Supplier> {
        const supplier = await this.connection.getEntityOrThrow(ctx, Supplier, id);
        if (input.name !== undefined) {
            if (!input.name.trim()) {
                throw new UserInputError('El nombre del proveedor es obligatorio');
            }
            supplier.name = input.name.trim();
        }
        if (input.contactName !== undefined) supplier.contactName = input.contactName.trim();
        if (input.phone !== undefined) supplier.phone = input.phone.trim();
        if (input.whatsapp !== undefined) supplier.whatsapp = input.whatsapp.trim();
        if (input.email !== undefined) supplier.email = input.email.trim();
        if (input.address !== undefined) supplier.address = input.address.trim();
        if (input.notes !== undefined) supplier.notes = input.notes.trim();
        if (input.active !== undefined) supplier.active = input.active;
        return this.connection.getRepository(ctx, Supplier).save(supplier);
    }

    /** Suppliers with existing purchase orders can't be deleted (PurchaseOrder.supplier is
     *  onDelete: 'RESTRICT') — that history must never silently vanish or orphan. Caught here and
     *  turned into a clear message instead of a raw FK constraint error reaching the admin. */
    async delete(ctx: RequestContext, id: ID): Promise<void> {
        const supplier = await this.connection.getEntityOrThrow(ctx, Supplier, id);
        try {
            await this.connection.getRepository(ctx, Supplier).remove(supplier);
        } catch {
            throw new UserInputError(
                'No se puede eliminar un proveedor con órdenes de compra registradas — desactivalo en vez de borrarlo.',
            );
        }
    }

    findProductVariantsForSupplier(ctx: RequestContext, supplierId: ID): Promise<SupplierProductVariant[]> {
        return this.connection.getRepository(ctx, SupplierProductVariant).find({
            where: { supplier: { id: supplierId } },
            relations: ['productVariant', 'productVariant.product'],
            order: { createdAt: 'ASC' },
        });
    }

    /** Also used by PurchaseOrderService to resolve whether a given line is INVENTARIO_PROPIO or
     *  DROPSHIPPING at receipt time — see that service's doc comment. */
    findSupplierProductVariant(ctx: RequestContext, supplierId: ID, productVariantId: ID): Promise<SupplierProductVariant | null> {
        return this.connection.getRepository(ctx, SupplierProductVariant).findOne({
            where: { supplier: { id: supplierId }, productVariant: { id: productVariantId } },
        });
    }

    async createSupplierProductVariant(ctx: RequestContext, input: SupplierProductVariantInput): Promise<SupplierProductVariant> {
        if (!SOURCING_TYPES.includes(input.sourcingType)) {
            throw new UserInputError(`El tipo de abastecimiento debe ser uno de: ${SOURCING_TYPES.join(', ')}`);
        }
        const existing = await this.findSupplierProductVariant(ctx, input.supplierId, input.productVariantId);
        if (existing) {
            throw new UserInputError('Este proveedor ya tiene esta variante asociada — editá la fila existente en vez de crear otra.');
        }
        const supplier = await this.connection.getEntityOrThrow(ctx, Supplier, input.supplierId);
        const productVariant = await this.connection.getEntityOrThrow(ctx, ProductVariant, input.productVariantId, {
            channelId: ctx.channelId,
        });
        const row = new SupplierProductVariant({
            supplier,
            productVariant,
            supplierSku: input.supplierSku?.trim() ?? '',
            sourcingType: input.sourcingType,
            currentCostMinorUnits: input.currentCostMinorUnits ?? 0,
        });
        return this.connection.getRepository(ctx, SupplierProductVariant).save(row);
    }

    async updateSupplierProductVariant(
        ctx: RequestContext,
        id: ID,
        input: Partial<Pick<SupplierProductVariantInput, 'supplierSku' | 'sourcingType' | 'currentCostMinorUnits'>>,
    ): Promise<SupplierProductVariant> {
        const row = await this.connection.getEntityOrThrow(ctx, SupplierProductVariant, id);
        if (input.sourcingType !== undefined) {
            if (!SOURCING_TYPES.includes(input.sourcingType)) {
                throw new UserInputError(`El tipo de abastecimiento debe ser uno de: ${SOURCING_TYPES.join(', ')}`);
            }
            row.sourcingType = input.sourcingType;
        }
        if (input.supplierSku !== undefined) row.supplierSku = input.supplierSku.trim();
        if (input.currentCostMinorUnits !== undefined) row.currentCostMinorUnits = input.currentCostMinorUnits;
        return this.connection.getRepository(ctx, SupplierProductVariant).save(row);
    }

    /** Nothing FK-restricts this delete — a PurchaseOrderLine points at the ProductVariant
     *  directly, not at this relation row, so an existing order is never blocked by it. The
     *  tradeoff: if this is deleted while a PARCIALMENTE_RECIBIDA order still references that
     *  (supplier, variant) pair, a later receipt on that line will fail loudly instead of silently
     *  guessing a sourcing type — see PurchaseOrderService.receiveGoods. */
    async deleteSupplierProductVariant(ctx: RequestContext, id: ID): Promise<void> {
        const row = await this.connection.getEntityOrThrow(ctx, SupplierProductVariant, id);
        await this.connection.getRepository(ctx, SupplierProductVariant).remove(row);
    }
}
