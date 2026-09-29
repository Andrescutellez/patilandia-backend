import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';

import { PATILANDIA_FEEDS_PLUGIN_OPTIONS } from './constants';
import { FeedCatalogService } from './services/feed-catalog.service';
import { PluginInitOptions } from './types';

/**
 * Scaffold for the Feeds y SEO roadmap (Google Merchant / Meta Catalog / TikTok Catalog — see
 * the vault's "Feeds de Producto y SEO — Roadmap"). Like patilandia-gifts, its first real feature
 * (the "Pautar en Ads" checklist) needs no entities or API extensions of its own: it reads/writes
 * the `Product.customFields.adsEligible` field declared in vendure-config.ts through Vendure's
 * built-in `updateProduct` Admin mutation. The actual feed-generation pipeline (F1-2 onward) will
 * add real entities/services/resolvers here as it's built.
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [
        { provide: PATILANDIA_FEEDS_PLUGIN_OPTIONS, useFactory: () => PatilandiaFeedsPlugin.options },
        FeedCatalogService,
    ],
    configuration: config => config,
    compatibility: '^3.0.0',
    dashboard: './dashboard/index.tsx',
})
export class PatilandiaFeedsPlugin {
    static options: PluginInitOptions;

    static init(options: PluginInitOptions): Type<PatilandiaFeedsPlugin> {
        this.options = options;
        return PatilandiaFeedsPlugin;
    }
}
