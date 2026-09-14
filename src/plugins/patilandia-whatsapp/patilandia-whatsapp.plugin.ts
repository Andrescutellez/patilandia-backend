import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';

import { adminApiExtensions, shopApiExtensions } from './api/api-extensions';
import { WhatsappAdminResolver } from './api/whatsapp-admin.resolver';
import { WhatsappShopResolver } from './api/whatsapp-shop.resolver';
import { PATILANDIA_WHATSAPP_PLUGIN_OPTIONS } from './constants';
import { WhatsappSettings } from './entities/whatsapp-settings.entity';
import { WhatsappSettingsService } from './services/whatsapp-settings.service';
import { PluginInitOptions } from './types';

/**
 * MVP scope, explicitly requested by the user: click-to-chat `wa.me` links only, no WhatsApp
 * Business API, no external service. This plugin only owns the configurable phone number/message —
 * see WhatsappSettingsService's doc comment for exactly where a future Cloud API integration would
 * attach (its own event-subscribers.ts + messaging service, reading the number from here).
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [
        { provide: PATILANDIA_WHATSAPP_PLUGIN_OPTIONS, useFactory: () => PatilandiaWhatsappPlugin.options },
        WhatsappSettingsService,
    ],
    configuration: config => config,
    compatibility: '^3.0.0',
    entities: [WhatsappSettings],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [WhatsappAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [WhatsappShopResolver],
    },
    dashboard: './dashboard/index.tsx',
})
export class PatilandiaWhatsappPlugin {
    static options: PluginInitOptions;

    static init(options: PluginInitOptions): Type<PatilandiaWhatsappPlugin> {
        this.options = options;
        return PatilandiaWhatsappPlugin;
    }
}
