import { OnApplicationBootstrap } from '@nestjs/common';
import {
    ChannelService,
    EventBus,
    PluginCommonModule,
    RequestContextService,
    TransactionalConnection,
    Type,
    VendurePlugin,
} from '@vendure/core';

import { adminApiExtensions, shopApiExtensions } from './api/api-extensions';
import { LoyaltyAdminResolver } from './api/loyalty-admin.resolver';
import { LoyaltyShopResolver } from './api/loyalty-shop.resolver';
import { PATILANDIA_LOYALTY_PLUGIN_OPTIONS } from './constants';
import { LoyaltyAccount } from './entities/loyalty-account.entity';
import { LoyaltyRule } from './entities/loyalty-rule.entity';
import { LoyaltySettings } from './entities/loyalty-settings.entity';
import { LoyaltyTransaction } from './entities/loyalty-transaction.entity';
import { LoyaltyVerificationToken } from './entities/loyalty-verification-token.entity';
import { registerLoyaltyEventSubscribers } from './event-subscribers';
import { loyaltyReconciliationTask } from './scheduled-tasks/loyalty-reconciliation.task';
import { petBirthdayBonusTask } from './scheduled-tasks/pet-birthday-bonus.task';
import { LoyaltyEligibilityService } from './services/loyalty-eligibility.service';
import { LoyaltyVerificationService } from './services/loyalty-verification.service';
import { LoyaltyService } from './services/loyalty.service';
import { PluginInitOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [
        { provide: PATILANDIA_LOYALTY_PLUGIN_OPTIONS, useFactory: () => PatilandiaLoyaltyPlugin.options },
        LoyaltyService,
        LoyaltyEligibilityService,
        LoyaltyVerificationService,
    ],
    configuration: config => {
        config.schedulerOptions.tasks.push(petBirthdayBonusTask, loyaltyReconciliationTask);
        return config;
    },
    compatibility: '^3.0.0',
    entities: [LoyaltyAccount, LoyaltyTransaction, LoyaltyRule, LoyaltySettings, LoyaltyVerificationToken],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [LoyaltyAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [LoyaltyShopResolver],
    },
    dashboard: './dashboard/index.tsx',
})
export class PatilandiaLoyaltyPlugin implements OnApplicationBootstrap {
    static options: PluginInitOptions;

    static init(options: PluginInitOptions): Type<PatilandiaLoyaltyPlugin> {
        this.options = options;
        return PatilandiaLoyaltyPlugin;
    }

    constructor(
        private eventBus: EventBus,
        private loyaltyService: LoyaltyService,
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private channelService: ChannelService,
    ) {}

    async onApplicationBootstrap() {
        registerLoyaltyEventSubscribers(this.eventBus, this.loyaltyService, this.connection);

        const defaultChannel = await this.channelService.getDefaultChannel();
        const ctx = await this.requestContextService.create({ apiType: 'admin', channelOrToken: defaultChannel });
        await this.loyaltyService.seedDefaultsIfEmpty(ctx);
    }
}
