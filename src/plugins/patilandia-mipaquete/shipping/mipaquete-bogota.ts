import { Injector, LanguageCode, Order, RequestContext, ShippingCalculator, ShippingEligibilityChecker } from '@vendure/core';

import { MipaqueteService } from '../services/mipaquete.service';

let mipaqueteService: MipaqueteService;

/**
 * "Envío propio en Bogotá" — the user's explicit ask: when the admin turns this on (see
 * MipaqueteSettings, edited from patilandia-mipaquete's Dashboard page) and the destination is
 * Bogotá, Patilandia handles delivery itself instead of Mi Paquete, free or at a configured flat
 * rate. When the toggle is off, this method is never eligible and Bogotá orders go through Mi
 * Paquete like any other city.
 */
export const mipaqueteBogotaChecker = new ShippingEligibilityChecker({
    code: 'mipaquete-bogota-checker',
    description: [{ languageCode: LanguageCode.es, value: 'Elegible solo si "envío propio Bogotá" está activado y el destino es Bogotá' }],
    args: {},
    init: async (injector: Injector) => {
        mipaqueteService = injector.get(MipaqueteService);
    },
    check: async (ctx: RequestContext, order: Order) => {
        return mipaqueteService.isBogotaOwnShippingEligible(ctx, order);
    },
});

export const mipaqueteBogotaCalculator = new ShippingCalculator({
    code: 'mipaquete-bogota-calculator',
    description: [{ languageCode: LanguageCode.es, value: 'Tarifa configurada para el envío propio en Bogotá' }],
    args: {},
    init: async (injector: Injector) => {
        mipaqueteService = injector.get(MipaqueteService);
    },
    calculate: async (ctx: RequestContext, order: Order) => {
        const settings = await mipaqueteService.getSettings(ctx);
        const price = await mipaqueteService.applyBogotaFreeShipping(ctx, order, settings.bogotaOwnShippingCostMinorUnits);
        return {
            price,
            priceIncludesTax: true,
            taxRate: 0,
            // Lets the storefront's free-shipping progress bar (checkout-page.tsx) tell this method
            // apart from a real Mi Paquete carrier and switch to Bogotá's own threshold — same
            // "extra data via metadata" pattern mipaquete-carrier.ts already uses for shippingTime.
            metadata: { isBogotaOwnShipping: true },
        };
    },
});
