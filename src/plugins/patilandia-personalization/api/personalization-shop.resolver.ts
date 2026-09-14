import { Args, Query, Resolver } from '@nestjs/graphql';
import { Ctx, ID, RequestContext } from '@vendure/core';

import { PersonalizationConfig } from '../entities/personalization-config.entity';
import { PersonalizationService } from '../services/personalization.service';

@Resolver()
export class PersonalizationShopResolver {
    constructor(private personalizationService: PersonalizationService) {}

    @Query()
    personalizationConfigForProduct(
        @Ctx() ctx: RequestContext,
        @Args() args: { productId: ID },
    ): Promise<PersonalizationConfig | null> {
        return this.personalizationService.findEnabledForProduct(ctx, args.productId);
    }
}
