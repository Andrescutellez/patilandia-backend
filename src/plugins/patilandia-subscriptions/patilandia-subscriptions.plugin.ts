import { OnApplicationBootstrap } from '@nestjs/common';
import { EventBus, PluginCommonModule, TransactionalConnection, Type, VendurePlugin } from '@vendure/core';

import { adminApiExtensions, shopApiExtensions } from './api/api-extensions';
import { SubscriptionAdminResolver } from './api/subscription-admin.resolver';
import { SubscriptionShopResolver } from './api/subscription-shop.resolver';
import { PATILANDIA_SUBSCRIPTIONS_PLUGIN_OPTIONS } from './constants';
import { ProductSubscription } from './entities/product-subscription.entity';
import { registerSubscriptionEventSubscribers } from './event-subscribers';
import { subscriptionReminderTask } from './scheduled-tasks/subscription-reminder.task';
import { SubscriptionService } from './services/subscription.service';
import { PluginInitOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [
        { provide: PATILANDIA_SUBSCRIPTIONS_PLUGIN_OPTIONS, useFactory: () => PatilandiaSubscriptionsPlugin.options },
        SubscriptionService,
    ],
    configuration: config => {
        config.schedulerOptions.tasks.push(subscriptionReminderTask);
        return config;
    },
    compatibility: '^3.0.0',
    entities: [ProductSubscription],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [SubscriptionAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [SubscriptionShopResolver],
    },
    dashboard: './dashboard/index.tsx',
})
export class PatilandiaSubscriptionsPlugin implements OnApplicationBootstrap {
    static options: PluginInitOptions;

    static init(options: PluginInitOptions): Type<PatilandiaSubscriptionsPlugin> {
        this.options = options;
        return PatilandiaSubscriptionsPlugin;
    }

    constructor(
        private eventBus: EventBus,
        private subscriptionService: SubscriptionService,
        private connection: TransactionalConnection,
    ) {}

    onApplicationBootstrap() {
        registerSubscriptionEventSubscribers(this.eventBus, this.subscriptionService, this.connection);
    }
}
