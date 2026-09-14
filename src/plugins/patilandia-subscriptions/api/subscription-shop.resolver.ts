import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, ID, RequestContext, Transaction } from '@vendure/core';

import { ProductSubscription } from '../entities/product-subscription.entity';
import {
    CreateSubscriptionInput,
    SubscriptionService,
    UpdateSubscriptionAddressInput,
} from '../services/subscription.service';

@Resolver()
export class SubscriptionShopResolver {
    constructor(private subscriptionService: SubscriptionService) {}

    @Query()
    mySubscriptions(@Ctx() ctx: RequestContext): Promise<ProductSubscription[]> {
        return this.subscriptionService.findMine(ctx);
    }

    @Mutation()
    @Transaction()
    createProductSubscription(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: CreateSubscriptionInput },
    ): Promise<ProductSubscription> {
        return this.subscriptionService.create(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    pauseSubscription(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<ProductSubscription> {
        return this.subscriptionService.pause(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    resumeSubscription(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<ProductSubscription> {
        return this.subscriptionService.resume(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    cancelSubscription(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<ProductSubscription> {
        return this.subscriptionService.cancel(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    updateSubscriptionQuantity(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID; quantity: number },
    ): Promise<ProductSubscription> {
        return this.subscriptionService.updateQuantity(ctx, args.id, args.quantity);
    }

    @Mutation()
    @Transaction()
    updateSubscriptionFrequency(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID; frequencyDays: number },
    ): Promise<ProductSubscription> {
        return this.subscriptionService.updateFrequency(ctx, args.id, args.frequencyDays);
    }

    @Mutation()
    @Transaction()
    updateSubscriptionAddress(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: UpdateSubscriptionAddressInput },
    ): Promise<ProductSubscription> {
        return this.subscriptionService.updateAddress(ctx, args.input);
    }
}
