import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, ID, RequestContext, Transaction } from '@vendure/core';

import { PetProfile } from '../entities/pet-profile.entity';
import { PetProfileService } from '../services/pet-profile.service';

@Resolver()
export class PetProfileAdminResolver {
    constructor(private petProfileService: PetProfileService) {}

    @Query()
    @Allow(Permission.ReadCustomer)
    petProfiles(@Ctx() ctx: RequestContext): Promise<PetProfile[]> {
        return this.petProfileService.findAll(ctx);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.DeleteCustomer)
    async adminDeletePetProfile(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<boolean> {
        await this.petProfileService.adminDelete(ctx, args.id);
        return true;
    }
}
