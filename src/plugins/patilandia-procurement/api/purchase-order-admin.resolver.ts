import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, ID, RequestContext, Transaction } from '@vendure/core';

import { PurchaseOrderLine } from '../entities/purchase-order-line.entity';
import { PurchaseOrder } from '../entities/purchase-order.entity';
import {
    CreatePurchaseOrderInput,
    PurchaseOrderService,
    ReceiveGoodsInput,
    UpdatePurchaseOrderInput,
} from '../services/purchase-order.service';

@Resolver()
export class PurchaseOrderAdminResolver {
    constructor(private purchaseOrderService: PurchaseOrderService) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    async purchaseOrders(@Ctx() ctx: RequestContext) {
        const items = await this.purchaseOrderService.findAll(ctx);
        return { items, totalItems: items.length };
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    purchaseOrder(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<PurchaseOrder | null> {
        return this.purchaseOrderService.findOne(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    createPurchaseOrder(@Ctx() ctx: RequestContext, @Args() args: { input: CreatePurchaseOrderInput }): Promise<PurchaseOrder> {
        return this.purchaseOrderService.create(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    updatePurchaseOrder(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: UpdatePurchaseOrderInput & { id: ID } },
    ): Promise<PurchaseOrder> {
        const { id, ...input } = args.input;
        return this.purchaseOrderService.update(ctx, id, input);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    sendPurchaseOrder(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<PurchaseOrder> {
        return this.purchaseOrderService.send(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    receiveGoods(@Ctx() ctx: RequestContext, @Args() args: { input: ReceiveGoodsInput }): Promise<PurchaseOrder> {
        return this.purchaseOrderService.receiveGoods(ctx, args.input);
    }
}

/** Computed, never stored — there's nothing to keep in sync since these are always derived
 *  straight from the lines that are already loaded. */
@Resolver('PurchaseOrder')
export class PurchaseOrderEntityResolver {
    @ResolveField()
    totalMinorUnits(@Parent() order: PurchaseOrder): number {
        return (order.lines ?? []).reduce((sum, line) => sum + line.quantityOrdered * line.unitCostMinorUnits, 0);
    }
}

@Resolver('PurchaseOrderLine')
export class PurchaseOrderLineEntityResolver {
    @ResolveField()
    subtotalMinorUnits(@Parent() line: PurchaseOrderLine): number {
        return line.quantityOrdered * line.unitCostMinorUnits;
    }
}
