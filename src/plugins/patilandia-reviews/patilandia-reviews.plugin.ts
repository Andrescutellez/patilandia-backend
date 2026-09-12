import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';

import { adminApiExtensions, shopApiExtensions } from './api/api-extensions';
import { ProductReviewAdminResolver } from './api/product-review-admin.resolver';
import { ProductReviewShopResolver } from './api/product-review-shop.resolver';
import { PATILANDIA_REVIEWS_PLUGIN_OPTIONS } from './constants';
import { ProductReview } from './entities/product-review.entity';
import { ProductReviewService } from './services/product-review.service';
import { PluginInitOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [
        { provide: PATILANDIA_REVIEWS_PLUGIN_OPTIONS, useFactory: () => PatilandiaReviewsPlugin.options },
        ProductReviewService,
    ],
    configuration: config => config,
    compatibility: '^3.0.0',
    entities: [ProductReview],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [ProductReviewAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [ProductReviewShopResolver],
    },
    dashboard: './dashboard/index.tsx',
})
export class PatilandiaReviewsPlugin {
    static options: PluginInitOptions;

    static init(options: PluginInitOptions): Type<PatilandiaReviewsPlugin> {
        this.options = options;
        return PatilandiaReviewsPlugin;
    }
}
