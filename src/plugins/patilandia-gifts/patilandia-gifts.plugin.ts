import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';

import { PATILANDIA_GIFTS_PLUGIN_OPTIONS } from './constants';
import { PluginInitOptions } from './types';

/**
 * Unlike every other Patilandia plugin, this one defines no entities and no API extensions: the
 * whole feature runs on Vendure's own native mechanisms — the `Order`/`Address` customFields
 * declared in vendure-config.ts, and the native `setOrderCustomFields`/`setOrderShippingAddress`
 * Shop API mutations. This plugin exists only to register the Dashboard callout that makes a gift
 * order visually obvious to whoever is packing it.
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [{ provide: PATILANDIA_GIFTS_PLUGIN_OPTIONS, useFactory: () => PatilandiaGiftsPlugin.options }],
    configuration: config => config,
    compatibility: '^3.0.0',
    dashboard: './dashboard/index.tsx',
})
export class PatilandiaGiftsPlugin {
    static options: PluginInitOptions;

    static init(options: PluginInitOptions): Type<PatilandiaGiftsPlugin> {
        this.options = options;
        return PatilandiaGiftsPlugin;
    }
}
