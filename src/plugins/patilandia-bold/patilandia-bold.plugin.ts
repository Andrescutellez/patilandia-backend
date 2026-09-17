import { OnApplicationBootstrap } from '@nestjs/common';
import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';
import express from 'express';

import { BoldShopResolver } from './api/bold-shop.resolver';
import { boldWebhookHandler } from './api/bold-webhook.middleware';
import { shopApiExtensions } from './api/api-extensions';
import { PATILANDIA_BOLD_PLUGIN_OPTIONS } from './constants';
import { BoldService } from './services/bold.service';
import { PluginInitOptions } from './types';

const WEBHOOK_ROUTE = '/bold/webhook';

/**
 * Real payment gateway (Bold, Colombia) replacing the dummy "Pago en línea" placeholder — see
 * Decisiones y Razonamiento for the research behind the Payment Button + webhook + active-query
 * design. No entities: the only durable state this needs (the settled Payment) is native Vendure
 * (Order/Payment), created via OrderService.addManualPaymentToOrder once Bold confirms.
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [{ provide: PATILANDIA_BOLD_PLUGIN_OPTIONS, useFactory: () => PatilandiaBoldPlugin.options }, BoldService],
    configuration: config => {
        config.apiOptions.middleware = [
            ...(config.apiOptions.middleware ?? []),
            // Captures the raw body as a Buffer before Vendure's default JSON parser can touch
            // it — required to verify Bold's HMAC signature, which is computed over the exact
            // bytes Bold sent, not a re-serialized copy. Must run beforeListen so it wins the
            // race against the app-wide JSON body-parser Nest/Express set up automatically.
            { route: WEBHOOK_ROUTE, handler: express.raw({ type: 'application/json' }), beforeListen: true },
            { route: WEBHOOK_ROUTE, handler: boldWebhookHandler },
        ];
        return config;
    },
    compatibility: '^3.0.0',
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [BoldShopResolver],
    },
})
export class PatilandiaBoldPlugin implements OnApplicationBootstrap {
    static options: PluginInitOptions;
    /** Set once at bootstrap so the plain-function webhook handler (see bold-webhook.middleware.ts
     *  for why it isn't a NestJS-DI class) can reach the service without going through Nest's
     *  middleware-specific dependency resolution, which can't see this module's own providers. */
    static boldService: BoldService;

    static init(options: PluginInitOptions): Type<PatilandiaBoldPlugin> {
        this.options = options;
        return PatilandiaBoldPlugin;
    }

    constructor(private boldService: BoldService) {}

    onApplicationBootstrap() {
        PatilandiaBoldPlugin.boldService = this.boldService;
    }
}
