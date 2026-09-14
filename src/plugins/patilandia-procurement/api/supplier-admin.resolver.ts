import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, ID, RequestContext, Transaction } from '@vendure/core';

import { SupplierProductVariant } from '../entities/supplier-product-variant.entity';
import { Supplier } from '../entities/supplier.entity';
import {
    SupplierInput,
    SupplierProductVariantInput,
    SupplierService,
} from '../services/supplier.service';

@Resolver()
export class SupplierAdminResolver {
    constructor(private supplierService: SupplierService) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    async suppliers(@Ctx() ctx: RequestContext) {
        const items = await this.supplierService.findAll(ctx);
        return { items, totalItems: items.length };
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    supplier(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<Supplier | null> {
        return this.supplierService.findOne(ctx, args.id);
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    supplierProductVariants(@Ctx() ctx: RequestContext, @Args() args: { supplierId: ID }): Promise<SupplierProductVariant[]> {
        return this.supplierService.findProductVariantsForSupplier(ctx, args.supplierId);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    createSupplier(@Ctx() ctx: RequestContext, @Args() args: { input: SupplierInput }): Promise<Supplier> {
        return this.supplierService.create(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    updateSupplier(@Ctx() ctx: RequestContext, @Args() args: { input: SupplierInput & { id: ID } }): Promise<Supplier> {
        const { id, ...input } = args.input;
        return this.supplierService.update(ctx, id, input);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    async deleteSupplier(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<boolean> {
        await this.supplierService.delete(ctx, args.id);
        return true;
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    createSupplierProductVariant(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: SupplierProductVariantInput },
    ): Promise<SupplierProductVariant> {
        return this.supplierService.createSupplierProductVariant(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    updateSupplierProductVariant(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: Partial<SupplierProductVariantInput> & { id: ID } },
    ): Promise<SupplierProductVariant> {
        const { id, ...input } = args.input;
        return this.supplierService.updateSupplierProductVariant(ctx, id, input);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    async deleteSupplierProductVariant(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<boolean> {
        await this.supplierService.deleteSupplierProductVariant(ctx, args.id);
        return true;
    }
}
