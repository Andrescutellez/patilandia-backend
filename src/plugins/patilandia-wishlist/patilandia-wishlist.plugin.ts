import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';

import { adminApiExtensions, shopApiExtensions } from './api/api-extensions';
import { WishlistAdminResolver } from './api/wishlist-admin.resolver';
import { WishlistShopResolver } from './api/wishlist-shop.resolver';
import { PATILANDIA_WISHLIST_PLUGIN_OPTIONS } from './constants';
import { WishlistItem } from './entities/wishlist-item.entity';
import { WishlistService } from './services/wishlist.service';
import { PluginInitOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [
        { provide: PATILANDIA_WISHLIST_PLUGIN_OPTIONS, useFactory: () => PatilandiaWishlistPlugin.options },
        WishlistService,
    ],
    configuration: config => config,
    compatibility: '^3.0.0',
    entities: [WishlistItem],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [WishlistAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [WishlistShopResolver],
    },
    dashboard: './dashboard/index.tsx',
})
export class PatilandiaWishlistPlugin {
    static options: PluginInitOptions;

    static init(options: PluginInitOptions): Type<PatilandiaWishlistPlugin> {
        this.options = options;
        return PatilandiaWishlistPlugin;
    }
}
