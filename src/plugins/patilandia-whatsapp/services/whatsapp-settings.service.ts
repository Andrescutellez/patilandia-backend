import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { WhatsappSettings } from '../entities/whatsapp-settings.entity';

export interface UpdateWhatsappSettingsInput {
    phoneNumber?: string;
    enabled?: boolean;
    defaultMessage?: string;
}

/**
 * Deliberately the only thing this plugin does today: store and expose the storefront's WhatsApp
 * number. This is the seam a future WhatsApp Business Cloud API integration (order confirmations,
 * status-change notifications, cart-recovery nudges, automated support) would plug into — it would
 * live in its own event-subscribers.ts + messaging service (same shape as patilandia-loyalty and
 * patilandia-subscriptions' OrderStateTransitionEvent subscribers), reading the phone number from
 * here without this service needing to change at all. Not built yet, on purpose — the user
 * explicitly asked to hold off on the real API until it's actually being integrated.
 */
@Injectable()
export class WhatsappSettingsService {
    constructor(private connection: TransactionalConnection) {}

    async getSettings(ctx: RequestContext): Promise<WhatsappSettings> {
        const [existing] = await this.connection.getRepository(ctx, WhatsappSettings).find({ take: 1 });
        if (existing) return existing;
        return this.connection.getRepository(ctx, WhatsappSettings).save(new WhatsappSettings());
    }

    async updateSettings(ctx: RequestContext, input: UpdateWhatsappSettingsInput): Promise<WhatsappSettings> {
        const settings = await this.getSettings(ctx);
        Object.assign(settings, input);
        return this.connection.getRepository(ctx, WhatsappSettings).save(settings);
    }
}
