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

import { ProductQuestion } from '../entities/product-question.entity';
import { ProductQuestionService } from '../services/product-question.service';

@Resolver()
export class ProductQuestionAdminResolver {
    constructor(private productQuestionService: ProductQuestionService) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    productQuestions(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<ProductQuestion> },
    ): Promise<PaginatedList<ProductQuestion>> {
        return this.productQuestionService.findAll(ctx, args.options ?? undefined);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    answerProductQuestion(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID; answer: string },
    ): Promise<ProductQuestion> {
        return this.productQuestionService.answer(ctx, args.id, args.answer);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    hideProductQuestion(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<ProductQuestion> {
        return this.productQuestionService.hide(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.DeleteCatalog)
    async deleteProductQuestion(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<boolean> {
        await this.productQuestionService.delete(ctx, args.id);
        return true;
    }
}
