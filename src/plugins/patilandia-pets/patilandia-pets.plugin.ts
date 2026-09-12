import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';

import { adminApiExtensions, shopApiExtensions } from './api/api-extensions';
import { PetProfileAdminResolver } from './api/pet-profile-admin.resolver';
import { PetProfileShopResolver } from './api/pet-profile-shop.resolver';
import { PATILANDIA_PETS_PLUGIN_OPTIONS } from './constants';
import { PetProfile } from './entities/pet-profile.entity';
import { PetProfileService } from './services/pet-profile.service';
import { PluginInitOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [
        { provide: PATILANDIA_PETS_PLUGIN_OPTIONS, useFactory: () => PatilandiaPetsPlugin.options },
        PetProfileService,
    ],
    configuration: config => config,
    compatibility: '^3.0.0',
    entities: [PetProfile],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [PetProfileAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [PetProfileShopResolver],
    },
    dashboard: './dashboard/index.tsx',
})
export class PatilandiaPetsPlugin {
    static options: PluginInitOptions;

    static init(options: PluginInitOptions): Type<PatilandiaPetsPlugin> {
        this.options = options;
        return PatilandiaPetsPlugin;
    }
}
