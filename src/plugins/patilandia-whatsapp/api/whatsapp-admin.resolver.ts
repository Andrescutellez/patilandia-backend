import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';

import { WhatsappSettings } from '../entities/whatsapp-settings.entity';
import { UpdateWhatsappSettingsInput, WhatsappSettingsService } from '../services/whatsapp-settings.service';

@Resolver()
export class WhatsappAdminResolver {
    constructor(private whatsappSettingsService: WhatsappSettingsService) {}

    @Query()
    @Allow(Permission.ReadSettings)
    whatsappSettings(@Ctx() ctx: RequestContext): Promise<WhatsappSettings> {
        return this.whatsappSettingsService.getSettings(ctx);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateSettings)
    updateWhatsappSettings(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: UpdateWhatsappSettingsInput },
    ): Promise<WhatsappSettings> {
        return this.whatsappSettingsService.updateSettings(ctx, args.input);
    }
}
