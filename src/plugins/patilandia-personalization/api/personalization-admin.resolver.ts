import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, ID, RequestContext, Transaction } from '@vendure/core';

import { PersonalizationConfig } from '../entities/personalization-config.entity';
import { PersonalizationService, type SavePersonalizationConfigInput } from '../services/personalization.service';

@Resolver()
export class PersonalizationAdminResolver {
    constructor(private personalizationService: PersonalizationService) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    personalizationConfigForProduct(
        @Ctx() ctx: RequestContext,
        @Args() args: { productId: ID },
    ): Promise<PersonalizationConfig | null> {
        return this.personalizationService.findForProductAdmin(ctx, args.productId);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    savePersonalizationConfig(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: SavePersonalizationConfigInput },
    ): Promise<PersonalizationConfig> {
        return this.personalizationService.save(ctx, args.input);
    }
}
