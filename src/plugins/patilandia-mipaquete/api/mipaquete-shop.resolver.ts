import { Args, Query, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';

import { MipaqueteService } from '../services/mipaquete.service';

@Resolver()
export class MipaqueteShopResolver {
    constructor(private mipaqueteService: MipaqueteService) {}

    @Query()
    mipaqueteLocations(
        @Ctx() ctx: RequestContext,
        @Args() args: { search: string },
    ): Promise<Array<{ locationCode: string; locationName: string; departmentOrStateName: string }>> {
        return this.mipaqueteService.searchLocations(args.search);
    }

    @Query()
    mipaqueteFreeShippingSettings(@Ctx() ctx: RequestContext) {
        return this.mipaqueteService.getFreeShippingProgressSettings(ctx);
    }
}
