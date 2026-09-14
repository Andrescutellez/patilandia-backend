import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, ID, ListQueryOptions, PaginatedList, RequestContext } from '@vendure/core';

import { ProductQuestion } from '../entities/product-question.entity';
import { ProductQuestionService, type SubmitProductQuestionInput } from '../services/product-question.service';

@Resolver()
export class ProductQuestionShopResolver {
    constructor(private productQuestionService: ProductQuestionService) {}

    @Query()
    productQuestions(
        @Ctx() ctx: RequestContext,
        @Args() args: { productId: ID; options?: ListQueryOptions<ProductQuestion> },
    ): Promise<PaginatedList<ProductQuestion>> {
        return this.productQuestionService.findApprovedForProduct(ctx, args.productId, args.options ?? undefined);
    }

    @Mutation()
    submitProductQuestion(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: SubmitProductQuestionInput },
    ): Promise<ProductQuestion> {
        return this.productQuestionService.submit(ctx, args.input);
    }
}
