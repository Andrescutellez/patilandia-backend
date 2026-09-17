import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext, Transaction } from '@vendure/core';

import { BoldService } from '../services/bold.service';
import { BoldCheckoutData, BoldPaymentStatus } from '../types';

@Resolver()
export class BoldShopResolver {
    constructor(private boldService: BoldService) {}

    @Mutation()
    @Transaction()
    generateBoldCheckout(@Ctx() ctx: RequestContext): Promise<BoldCheckoutData> {
        return this.boldService.generateCheckoutData(ctx);
    }

    @Query()
    @Transaction()
    boldPaymentStatus(@Ctx() ctx: RequestContext, @Args() args: { orderCode: string }): Promise<BoldPaymentStatus> {
        return this.boldService.getPaymentStatus(ctx, args.orderCode);
    }
}
