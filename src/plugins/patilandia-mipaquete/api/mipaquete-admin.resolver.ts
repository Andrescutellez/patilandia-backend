import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, ProductVariant, RequestContext, Transaction } from '@vendure/core';

import { MipaqueteSettings, ShippingSubsidyMode } from '../entities/mipaquete-settings.entity';
import { MipaqueteShipment } from '../entities/mipaquete-shipment.entity';
import { MipaqueteService } from '../services/mipaquete.service';

@Resolver()
export class MipaqueteAdminResolver {
    constructor(private mipaqueteService: MipaqueteService) {}

    @Query()
    @Allow(Permission.ReadSettings)
    mipaqueteSettings(@Ctx() ctx: RequestContext): Promise<MipaqueteSettings> {
        return this.mipaqueteService.getSettings(ctx);
    }

    @Query()
    @Allow(Permission.ReadSettings)
    mipaqueteShipments(@Ctx() ctx: RequestContext): Promise<MipaqueteShipment[]> {
        return this.mipaqueteService.listShipments(ctx);
    }

    @Query()
    @Allow(Permission.ReadSettings)
    mipaqueteIncompleteVariants(@Ctx() ctx: RequestContext): Promise<ProductVariant[]> {
        return this.mipaqueteService.findVariantsWithIncompleteShippingData(ctx);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateSettings)
    updateMipaqueteSettings(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            input: {
                bogotaOwnShippingEnabled?: boolean;
                bogotaOwnShippingCostMinorUnits?: number;
                automaticGuideEnabled?: boolean;
                shippingSubsidyMode?: ShippingSubsidyMode;
                shippingSubsidyPercentage?: number;
                shippingSubsidyFixedMinorUnits?: number;
                freeShippingThresholdEnabled?: boolean;
                freeShippingThresholdMinorUnits?: number;
                bogotaFreeShippingThresholdEnabled?: boolean;
                bogotaFreeShippingThresholdMinorUnits?: number;
            };
        },
    ): Promise<MipaqueteSettings> {
        return this.mipaqueteService.updateSettings(ctx, args.input);
    }
}
