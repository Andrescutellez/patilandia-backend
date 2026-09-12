import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';

import { LoyaltyAccount } from '../entities/loyalty-account.entity';
import { LoyaltyRule } from '../entities/loyalty-rule.entity';
import { LoyaltySettings } from '../entities/loyalty-settings.entity';
import { LoyaltyTransaction } from '../entities/loyalty-transaction.entity';
import { LoyaltyService } from '../services/loyalty.service';

@Resolver()
export class LoyaltyAdminResolver {
    constructor(private loyaltyService: LoyaltyService) {}

    @Query()
    @Allow(Permission.ReadCustomer)
    loyaltyAccounts(@Ctx() ctx: RequestContext): Promise<LoyaltyAccount[]> {
        return this.loyaltyService.listAccounts(ctx);
    }

    @Query()
    @Allow(Permission.ReadCustomer)
    loyaltyTransactions(@Ctx() ctx: RequestContext): Promise<LoyaltyTransaction[]> {
        return this.loyaltyService.listAllTransactions(ctx);
    }

    @Query()
    @Allow(Permission.ReadCustomer)
    loyaltyRules(@Ctx() ctx: RequestContext): Promise<LoyaltyRule[]> {
        return this.loyaltyService.listRules(ctx);
    }

    @Query()
    @Allow(Permission.ReadCustomer)
    loyaltySettings(@Ctx() ctx: RequestContext): Promise<LoyaltySettings> {
        return this.loyaltyService.getSettings(ctx);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCustomer)
    updateLoyaltyRule(
        @Ctx() ctx: RequestContext,
        @Args()
        args: { input: { id: ID; enabled?: boolean; points?: number; currencyMinorUnitsPerPoint?: number } },
    ): Promise<LoyaltyRule> {
        return this.loyaltyService.updateRule(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCustomer)
    updateLoyaltySettings(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { pointValueInMinorUnits?: number; maxRedemptionPercentage?: number } },
    ): Promise<LoyaltySettings> {
        return this.loyaltyService.updateSettings(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCustomer)
    adjustLoyaltyBalance(
        @Ctx() ctx: RequestContext,
        @Args() args: { customerEmail: string; points: number; reason: string },
    ): Promise<LoyaltyTransaction> {
        return this.loyaltyService.adjustBalance(ctx, args);
    }
}
