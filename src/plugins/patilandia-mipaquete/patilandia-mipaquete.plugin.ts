import { OnApplicationBootstrap } from '@nestjs/common';
import { EventBus, PluginCommonModule, TransactionalConnection, VendurePlugin } from '@vendure/core';
import express from 'express';

import { adminApiExtensions, shopApiExtensions } from './api/api-extensions';
import { MipaqueteAdminResolver } from './api/mipaquete-admin.resolver';
import { MipaqueteShopResolver } from './api/mipaquete-shop.resolver';
import { mipaqueteGuideWebhookHandler, mipaqueteStateWebhookHandler } from './api/mipaquete-webhook.middleware';
import { loggerCtx } from './constants';
import { registerMipaqueteEventSubscribers } from './event-subscribers';
import { MipaqueteQuoteCache } from './entities/mipaquete-quote-cache.entity';
import { MipaqueteSettings } from './entities/mipaquete-settings.entity';
import { MipaqueteShipment } from './entities/mipaquete-shipment.entity';
import { MipaqueteClient } from './services/mipaquete-client';
import { MipaqueteService } from './services/mipaquete.service';
import './types';

const GUIDE_WEBHOOK_ROUTE = '/mipaquete/webhook/guides';
const STATE_WEBHOOK_ROUTE = '/mipaquete/webhook/states';

/**
 * Real shipping-carrier integration (Mi Paquete, a Colombian logistics aggregator) — replaces the
 * flat-rate ShippingMethods configure-checkout.ts used to create with live cotización/creación de
 * envío/tracking, per mipaquete-api-v2.md. See shipping/mipaquete-carrier.ts and
 * shipping/mipaquete-bogota.ts for the two ShippingCalculator/ShippingEligibilityChecker pairs this
 * plugin registers (wired into shippingOptions in ../../vendure-config.ts, same place
 * patilandiaFulfillmentHandler already lives).
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [MipaqueteClient, MipaqueteService],
    configuration: config => {
        config.apiOptions.middleware = [
            ...(config.apiOptions.middleware ?? []),
            { route: GUIDE_WEBHOOK_ROUTE, handler: express.json(), beforeListen: true },
            { route: GUIDE_WEBHOOK_ROUTE, handler: mipaqueteGuideWebhookHandler },
            { route: STATE_WEBHOOK_ROUTE, handler: express.json(), beforeListen: true },
            { route: STATE_WEBHOOK_ROUTE, handler: mipaqueteStateWebhookHandler },
        ];
        return config;
    },
    compatibility: '^3.0.0',
    entities: [MipaqueteShipment, MipaqueteQuoteCache, MipaqueteSettings],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [MipaqueteAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [MipaqueteShopResolver],
    },
    dashboard: './dashboard/index.tsx',
})
export class PatilandiaMipaquetePlugin implements OnApplicationBootstrap {
    /** Set once at bootstrap so the plain-function webhook handlers (see
     *  api/mipaquete-webhook.middleware.ts for why they aren't NestJS-DI classes — same reasoning as
     *  patilandia-bold) can reach the service without going through Nest's middleware-specific
     *  dependency resolution, which can't see this module's own providers. */
    static mipaqueteService: MipaqueteService;

    constructor(
        private mipaqueteService: MipaqueteService,
        private eventBus: EventBus,
        private connection: TransactionalConnection,
    ) {}

    onApplicationBootstrap() {
        PatilandiaMipaquetePlugin.mipaqueteService = this.mipaqueteService;
        registerMipaqueteEventSubscribers(this.eventBus, this.mipaqueteService, this.connection);
    }
}

export { loggerCtx };
