import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';

import { adminApiExtensions, shopApiExtensions } from './api/api-extensions';
import { PersonalizationAdminResolver } from './api/personalization-admin.resolver';
import { PersonalizationShopResolver } from './api/personalization-shop.resolver';
import { PATILANDIA_PERSONALIZATION_PLUGIN_OPTIONS } from './constants';
import { PersonalizationConfig } from './entities/personalization-config.entity';
import { PersonalizationField } from './entities/personalization-field.entity';
import { PersonalizationFieldOption } from './entities/personalization-field-option.entity';
import { PersonalizationService } from './services/personalization.service';
import { PluginInitOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [
        { provide: PATILANDIA_PERSONALIZATION_PLUGIN_OPTIONS, useFactory: () => PatilandiaPersonalizationPlugin.options },
        PersonalizationService,
    ],
    configuration: config => config,
    compatibility: '^3.0.0',
    entities: [PersonalizationConfig, PersonalizationField, PersonalizationFieldOption],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [PersonalizationAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [PersonalizationShopResolver],
    },
    dashboard: './dashboard/index.tsx',
})
export class PatilandiaPersonalizationPlugin {
    static options: PluginInitOptions;

    static init(options: PluginInitOptions): Type<PatilandiaPersonalizationPlugin> {
        this.options = options;
        return PatilandiaPersonalizationPlugin;
    }
}
