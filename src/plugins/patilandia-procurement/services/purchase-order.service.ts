import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    ProductVariant,
    RequestContext,
    StockLevel,
    StockLocationService,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { GoodsReceiptLine } from '../entities/goods-receipt-line.entity';
import { GoodsReceipt } from '../entities/goods-receipt.entity';
import { PurchaseOrderLine } from '../entities/purchase-order-line.entity';
import { PurchaseOrder } from '../entities/purchase-order.entity';
import { Supplier } from '../entities/supplier.entity';
import { SupplierService } from './supplier.service';

export interface PurchaseOrderLineInput {
    productVariantId: ID;
    quantityOrdered: number;
    unitCostMinorUnits: number;
}

export interface CreatePurchaseOrderInput {
    supplierId: ID;
    orderDate: string;
    notes?: string;
    lines: PurchaseOrderLineInput[];
}

export interface UpdatePurchaseOrderInput {
    orderDate?: string;
    notes?: string;
    lines?: PurchaseOrderLineInput[];
}

export interface ReceiveGoodsLineInput {
    purchaseOrderLineId: ID;
    quantityReceived: number;
}

export interface ReceiveGoodsInput {
    purchaseOrderId: ID;
    idempotencyKey: string;
    lines: ReceiveGoodsLineInput[];
}

const PURCHASE_ORDER_RELATIONS = ['supplier', 'lines', 'lines.productVariant', 'lines.productVariant.product'];

/**
 * The one place in this plugin that touches real Vendure stock — see the plan's "cómo se actualiza
 * stock de forma segura" for the full reasoning. Two things confirmed against the real Vendure
 * 3.7.3 source before writing this: (1) stock lives in `StockLevel` (one row per variant+location,
 * unique on that pair), not a plain column on ProductVariant; (2) Vendure's own
 * `StockLevelService.updateStockOnHandForLocation` is read-then-write, not atomic — a real lost-
 * update race under concurrent receipts. So `receiveGoods` never calls that method; it does its own
 * atomic Postgres UPSERT inside the same transaction as everything else in the receipt.
 */
@Injectable()
export class PurchaseOrderService {
    constructor(
        private connection: TransactionalConnection,
        private supplierService: SupplierService,
        private stockLocationService: StockLocationService,
    ) {}

    findAll(ctx: RequestContext): Promise<PurchaseOrder[]> {
        return this.connection
            .getRepository(ctx, PurchaseOrder)
            .find({ relations: PURCHASE_ORDER_RELATIONS, order: { createdAt: 'DESC' } });
    }

    findOne(ctx: RequestContext, id: ID): Promise<PurchaseOrder | null> {
        return this.connection.getRepository(ctx, PurchaseOrder).findOne({ where: { id }, relations: PURCHASE_ORDER_RELATIONS });
    }

    private async buildLine(ctx: RequestContext, supplierId: ID, input: PurchaseOrderLineInput): Promise<PurchaseOrderLine> {
        if (input.quantityOrdered < 1) {
            throw new UserInputError('La cantidad pedida debe ser al menos 1');
        }
        // A line can only be created for a (supplier, variant) pair that's already configured in
        // the sourcing relation — that's what lets receiveGoods later know, unambiguously, whether
        // to touch stock. See SupplierProductVariant's doc comment.
        const relation = await this.supplierService.findSupplierProductVariant(ctx, supplierId, input.productVariantId);
        if (!relation) {
            throw new UserInputError(
                'Esta variante no está asociada a este proveedor todavía — agregala primero desde la ficha del proveedor.',
            );
        }
        const productVariant = await this.connection.getEntityOrThrow(ctx, ProductVariant, input.productVariantId, {
            channelId: ctx.channelId,
        });
        return new PurchaseOrderLine({
            productVariant,
            quantityOrdered: input.quantityOrdered,
            quantityReceived: 0,
            unitCostMinorUnits: input.unitCostMinorUnits,
        });
    }

    async create(ctx: RequestContext, input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
        if (input.lines.length === 0) {
            throw new UserInputError('La orden necesita al menos una línea');
        }
        const supplier = await this.connection.getEntityOrThrow(ctx, Supplier, input.supplierId);
        const lines = await Promise.all(input.lines.map(line => this.buildLine(ctx, input.supplierId, line)));
        const order = new PurchaseOrder({
            supplier,
            status: 'BORRADOR',
            orderDate: new Date(input.orderDate),
            notes: input.notes?.trim() ?? '',
            lines,
        });
        return this.connection.getRepository(ctx, PurchaseOrder).save(order);
    }

    /** Only while BORRADOR — an order already ENVIADA represents a real commitment sent to the
     *  supplier and shouldn't be silently rewritten after the fact. */
    async update(ctx: RequestContext, id: ID, input: UpdatePurchaseOrderInput): Promise<PurchaseOrder> {
        const order = await this.getOrThrowWithLines(ctx, id);
        if (order.status !== 'BORRADOR') {
            throw new UserInputError('Solo se puede editar una orden mientras está en BORRADOR');
        }
        if (input.orderDate !== undefined) order.orderDate = new Date(input.orderDate);
        if (input.notes !== undefined) order.notes = input.notes.trim();
        if (input.lines !== undefined) {
            if (input.lines.length === 0) {
                throw new UserInputError('La orden necesita al menos una línea');
            }
            await this.connection.getRepository(ctx, PurchaseOrderLine).remove(order.lines);
            order.lines = await Promise.all(input.lines.map(line => this.buildLine(ctx, order.supplier.id, line)));
        }
        return this.connection.getRepository(ctx, PurchaseOrder).save(order);
    }

    async send(ctx: RequestContext, id: ID): Promise<PurchaseOrder> {
        const order = await this.getOrThrowWithLines(ctx, id);
        if (order.status !== 'BORRADOR') {
            throw new UserInputError('Solo se puede enviar una orden que está en BORRADOR');
        }
        order.status = 'ENVIADA';
        return this.connection.getRepository(ctx, PurchaseOrder).save(order);
    }

    private async getOrThrowWithLines(ctx: RequestContext, id: ID): Promise<PurchaseOrder> {
        const order = await this.findOne(ctx, id);
        if (!order) {
            throw new UserInputError('Orden de compra no encontrada');
        }
        return order;
    }

    /**
     * The single safe path to "goods arrived". Runs entirely inside the caller's transaction (the
     * resolver is decorated with @Transaction()):
     * 1. Idempotency check first — if a GoodsReceipt with this idempotencyKey already exists,
     *    return it untouched. A retried network request for the same receipt must be a no-op, not
     *    a second stock increase.
     * 2. Validate every line's new quantity doesn't push its cumulative total past what was
     *    ordered.
     * 3. Create the GoodsReceipt + its lines, bump each PurchaseOrderLine.quantityReceived.
     * 4. For each line, resolve its (supplier, variant) sourcing relation — only INVENTARIO_PROPIO
     *    ever touches real stock. DROPSHIPPING is skipped on purpose: that stock never sits in our
     *    warehouse, so there's nothing to add.
     * 5. Recompute the order's status from the lines' totals.
     */
    async receiveGoods(ctx: RequestContext, input: ReceiveGoodsInput): Promise<PurchaseOrder> {
        if (!input.idempotencyKey.trim()) {
            throw new UserInputError('Falta la clave de idempotencia de la recepción');
        }
        if (input.lines.length === 0) {
            throw new UserInputError('La recepción necesita al menos una línea');
        }

        const existingReceipt = await this.connection
            .getRepository(ctx, GoodsReceipt)
            .findOne({ where: { idempotencyKey: input.idempotencyKey }, relations: ['purchaseOrder'] });
        if (existingReceipt) {
            return this.getOrThrowWithLines(ctx, existingReceipt.purchaseOrder.id);
        }

        const order = await this.getOrThrowWithLines(ctx, input.purchaseOrderId);
        if (order.status !== 'ENVIADA' && order.status !== 'PARCIALMENTE_RECIBIDA') {
            throw new UserInputError('Solo se puede registrar una recepción sobre una orden ENVIADA o PARCIALMENTE_RECIBIDA');
        }

        const linesById = new Map(order.lines.map(line => [String(line.id), line]));
        for (const receiptLine of input.lines) {
            const line = linesById.get(String(receiptLine.purchaseOrderLineId));
            if (!line) {
                throw new UserInputError('Una de las líneas no pertenece a esta orden de compra');
            }
            if (receiptLine.quantityReceived < 1) {
                throw new UserInputError('La cantidad recibida debe ser al menos 1');
            }
            if (line.quantityReceived + receiptLine.quantityReceived > line.quantityOrdered) {
                throw new UserInputError(
                    `No se pueden recibir más unidades de las pedidas (pedidas: ${line.quantityOrdered}, ya recibidas: ${line.quantityReceived})`,
                );
            }
        }

        await this.connection.getRepository(ctx, GoodsReceipt).save(
            new GoodsReceipt({
                purchaseOrder: order,
                receivedAt: new Date(),
                idempotencyKey: input.idempotencyKey,
                lines: input.lines.map(
                    receiptLine =>
                        new GoodsReceiptLine({
                            purchaseOrderLine: linesById.get(String(receiptLine.purchaseOrderLineId)),
                            quantityReceived: receiptLine.quantityReceived,
                        }),
                ),
            }),
        );

        const stockLocation = await this.stockLocationService.defaultStockLocation(ctx);
        for (const receiptLine of input.lines) {
            const line = linesById.get(String(receiptLine.purchaseOrderLineId))!;
            line.quantityReceived += receiptLine.quantityReceived;
            await this.connection.getRepository(ctx, PurchaseOrderLine).save(line);

            const relation = await this.supplierService.findSupplierProductVariant(ctx, order.supplier.id, line.productVariant.id);
            if (!relation) {
                // The sourcing relation was deleted after this order was created — fail loudly
                // rather than silently guess whether this should touch physical stock.
                throw new UserInputError(
                    `No se encontró la relación proveedor-producto para "${line.productVariant.name}" — no se puede determinar si es inventario propio o dropshipping.`,
                );
            }
            if (relation.sourcingType === 'INVENTARIO_PROPIO') {
                await this.incrementStockOnHand(ctx, line.productVariant.id, stockLocation.id, receiptLine.quantityReceived);
            }
        }

        const refreshedOrder = await this.getOrThrowWithLines(ctx, order.id);
        const allComplete = refreshedOrder.lines.every(line => line.quantityReceived >= line.quantityOrdered);
        refreshedOrder.status = allComplete ? 'RECIBIDA' : 'PARCIALMENTE_RECIBIDA';
        await this.connection.getRepository(ctx, PurchaseOrder).save(refreshedOrder);

        return this.getOrThrowWithLines(ctx, order.id);
    }

    /** Atomic Postgres UPSERT on StockLevel's real unique index (productVariantId, stockLocationId)
     *  — see this class's doc comment for why Vendure's own updateStockOnHandForLocation isn't used
     *  here. Runs on the ctx-scoped transactional entity manager, not a fresh connection, so it
     *  participates in the same transaction as the rest of this receipt. */
    private async incrementStockOnHand(ctx: RequestContext, productVariantId: ID, stockLocationId: ID, change: number): Promise<void> {
        const manager = this.connection.getRepository(ctx, StockLevel).manager;
        await manager.query(
            `INSERT INTO stock_level ("productVariantId", "stockLocationId", "stockOnHand", "stockAllocated", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, 0, now(), now())
             ON CONFLICT ("productVariantId", "stockLocationId")
             DO UPDATE SET "stockOnHand" = stock_level."stockOnHand" + EXCLUDED."stockOnHand", "updatedAt" = now()`,
            [productVariantId, stockLocationId, change],
        );
    }
}
