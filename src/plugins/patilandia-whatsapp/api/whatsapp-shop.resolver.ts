import { Query, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';

import { WhatsappSettings } from '../entities/whatsapp-settings.entity';
import { WhatsappSettingsService } from '../services/whatsapp-settings.service';

@Resolver()
export class WhatsappShopResolver {
    constructor(private whatsappSettingsService: WhatsappSettingsService) {}

    @Query()
    whatsappSettings(@Ctx() ctx: RequestContext): Promise<WhatsappSettings> {
        return this.whatsappSettingsService.getSettings(ctx);
    }
}
