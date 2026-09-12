import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext, Transaction } from '@vendure/core';

import { PetProfile } from '../entities/pet-profile.entity';
import {
    CreatePetProfileInput,
    PetProfileService,
    UpdatePetProfileInput,
} from '../services/pet-profile.service';

@Resolver()
export class PetProfileShopResolver {
    constructor(private petProfileService: PetProfileService) {}

    @Query()
    myPetProfiles(
        @Ctx() ctx: RequestContext,
        @Args() args: { customerEmail: string },
    ): Promise<PetProfile[]> {
        return this.petProfileService.findForCustomerEmail(ctx, args.customerEmail);
    }

    @Mutation()
    @Transaction()
    createPetProfile(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: CreatePetProfileInput },
    ): Promise<PetProfile> {
        return this.petProfileService.create(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    updatePetProfile(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: UpdatePetProfileInput },
    ): Promise<PetProfile> {
        return this.petProfileService.update(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    async deletePetProfile(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string; customerEmail: string },
    ): Promise<boolean> {
        await this.petProfileService.delete(ctx, args.id, args.customerEmail);
        return true;
    }
}
