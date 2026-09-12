import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, ID, ListQueryOptions, PaginatedList, RequestContext } from '@vendure/core';

import { ProductReview } from '../entities/product-review.entity';
import { ProductReviewService, type SubmitProductReviewInput } from '../services/product-review.service';

@Resolver()
export class ProductReviewShopResolver {
    constructor(private productReviewService: ProductReviewService) {}

    @Query()
    productReviews(
        @Ctx() ctx: RequestContext,
        @Args() args: { productId: ID; options?: ListQueryOptions<ProductReview> },
    ): Promise<PaginatedList<ProductReview>> {
        return this.productReviewService.findApprovedForProduct(ctx, args.productId, args.options ?? undefined);
    }

    @Mutation()
    submitProductReview(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: SubmitProductReviewInput },
    ): Promise<ProductReview> {
        return this.productReviewService.submit(ctx, args.input);
    }
}
