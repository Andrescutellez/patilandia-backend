import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';

import { adminApiExtensions, shopApiExtensions } from './api/api-extensions';
import { ProductQuestionAdminResolver } from './api/product-question-admin.resolver';
import { ProductQuestionShopResolver } from './api/product-question-shop.resolver';
import { PATILANDIA_QA_PLUGIN_OPTIONS } from './constants';
import { ProductQuestion } from './entities/product-question.entity';
import { ProductQuestionService } from './services/product-question.service';
import { PluginInitOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [
        { provide: PATILANDIA_QA_PLUGIN_OPTIONS, useFactory: () => PatilandiaQaPlugin.options },
        ProductQuestionService,
    ],
    configuration: config => config,
    compatibility: '^3.0.0',
    entities: [ProductQuestion],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [ProductQuestionAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [ProductQuestionShopResolver],
    },
    dashboard: './dashboard/index.tsx',
})
export class PatilandiaQaPlugin {
    static options: PluginInitOptions;

    static init(options: PluginInitOptions): Type<PatilandiaQaPlugin> {
        this.options = options;
        return PatilandiaQaPlugin;
    }
}
