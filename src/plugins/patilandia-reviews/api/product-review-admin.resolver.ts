import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import {
    Allow,
    Ctx,
    ID,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    Transaction,
} from '@vendure/core';

import { ProductReview } from '../entities/product-review.entity';
import { ProductReviewService } from '../services/product-review.service';

@Resolver()
export class ProductReviewAdminResolver {
    constructor(private productReviewService: ProductReviewService) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    productReviews(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<ProductReview> },
    ): Promise<PaginatedList<ProductReview>> {
        return this.productReviewService.findAll(ctx, args.options ?? undefined);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    approveProductReview(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<ProductReview> {
        return this.productReviewService.setApproved(ctx, args.id, true);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    rejectProductReview(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<ProductReview> {
        return this.productReviewService.setApproved(ctx, args.id, false);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.DeleteCatalog)
    async deleteProductReview(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<boolean> {
        await this.productReviewService.delete(ctx, args.id);
        return true;
    }
}
