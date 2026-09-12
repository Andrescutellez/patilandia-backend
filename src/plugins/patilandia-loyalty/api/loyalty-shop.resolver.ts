import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Ctx, Order, RequestContext, Transaction } from '@vendure/core';

import { LoyaltyAccount } from '../entities/loyalty-account.entity';
import { LoyaltyRule } from '../entities/loyalty-rule.entity';
import { LoyaltySettings } from '../entities/loyalty-settings.entity';
import { LoyaltyTransaction } from '../entities/loyalty-transaction.entity';
import { LoyaltyEligibilityService } from '../services/loyalty-eligibility.service';
import { LoyaltyVerificationService } from '../services/loyalty-verification.service';
import { LoyaltyService } from '../services/loyalty.service';

@Resolver()
export class LoyaltyShopResolver {
    constructor(
        private loyaltyService: LoyaltyService,
        private eligibilityService: LoyaltyEligibilityService,
        private verificationService: LoyaltyVerificationService,
    ) {}

    @Query()
    async myLoyaltyAccount(
        @Ctx() ctx: RequestContext,
        @Args() args: { customerEmail: string },
    ): Promise<LoyaltyAccount & { eligible: boolean; redemptionBlockedReasons: string[] }> {
        const account = await this.loyaltyService.getOrCreateAccount(ctx, args.customerEmail);
        const eligibility = await this.eligibilityService.check(ctx, account);
        return Object.assign(account, {
            eligible: eligibility.eligible,
            redemptionBlockedReasons: eligibility.failedChecks,
        });
    }

    @Query()
    myLoyaltyTransactions(
        @Ctx() ctx: RequestContext,
        @Args() args: { customerEmail: string },
    ): Promise<LoyaltyTransaction[]> {
        return this.loyaltyService.findTransactionsForEmail(ctx, args.customerEmail);
    }

    @Query()
    loyaltySettings(@Ctx() ctx: RequestContext): Promise<LoyaltySettings> {
        return this.loyaltyService.getSettings(ctx);
    }

    @Query()
    async loyaltyRules(@Ctx() ctx: RequestContext): Promise<LoyaltyRule[]> {
        const rules = await this.loyaltyService.listRules(ctx);
        return rules.filter(rule => rule.enabled);
    }

    @Mutation()
    @Transaction()
    async requestLoyaltyEmailVerification(
        @Ctx() ctx: RequestContext,
        @Args() args: { customerEmail: string },
    ): Promise<boolean> {
        await this.verificationService.requestVerification(ctx, args.customerEmail);
        return true;
    }

    @Mutation()
    @Transaction()
    confirmLoyaltyEmailVerification(@Ctx() ctx: RequestContext, @Args() args: { token: string }): Promise<boolean> {
        return this.verificationService.confirmVerification(ctx, args.token);
    }

    @Mutation()
    @Transaction()
    async applyLoyaltyRedemption(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID; customerEmail: string; points: number },
    ): Promise<{ order: Order; pointsRedeemed: number; discountMinorUnits: number }> {
        return this.loyaltyService.applyRedemption(ctx, args);
    }

    @Mutation()
    @Transaction()
    removeLoyaltyRedemption(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID; customerEmail: string },
    ): Promise<Order> {
        return this.loyaltyService.removeRedemption(ctx, args);
    }
}
