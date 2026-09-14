import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, ID, RequestContext, Transaction } from '@vendure/core';

import { ProductSubscription } from '../entities/product-subscription.entity';
import { SubscriptionService } from '../services/subscription.service';

@Resolver()
export class SubscriptionAdminResolver {
    constructor(private subscriptionService: SubscriptionService) {}

    @Query()
    @Allow(Permission.ReadCustomer)
    subscriptions(
        @Ctx() ctx: RequestContext,
        @Args() args: { status?: string | null; search?: string | null },
    ): Promise<ProductSubscription[]> {
        return this.subscriptionService.findAllAdmin(ctx, args);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCustomer)
    cancelSubscriptionAdmin(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<ProductSubscription> {
        return this.subscriptionService.adminCancel(ctx, args.id);
    }
}
