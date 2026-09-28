import { Injector, LanguageCode, Order, RequestContext, ShippingCalculator, ShippingEligibilityChecker } from '@vendure/core';

import { MipaqueteService } from '../services/mipaquete.service';

let mipaqueteService: MipaqueteService;

/**
 * One ShippingMethod is registered per real Mi Paquete carrier (see
 * src/scripts/configure-checkout.ts, using the real `_id`s from /getDeliveryCompanies) — this pair
 * of checker/calculator is shared by all of them, told which carrier it represents via the
 * `deliveryCompanyId` arg. This is what lets the checkout's existing `eligibleShippingMethods`
 * radio-list UI (unchanged) show every real transportadora Mi Paquete quotes for a destination,
 * exactly as the user asked ("mostrar todas al cliente").
 *
 * Both getOrRefreshQuote's own caching (one real /quoteShipping call per order+destination+package,
 * reused by every carrier's checker AND calculator) and this checker's Bogotá short-circuit mean a
 * destination with "envío propio Bogotá" active never calls Mi Paquete's API at all.
 */
export const mipaqueteCarrierChecker = new ShippingEligibilityChecker({
    code: 'mipaquete-carrier-checker',
    description: [{ languageCode: LanguageCode.es, value: 'Elegible si esta transportadora de Mi Paquete cubre el destino cotizado' }],
    args: {
        deliveryCompanyId: {
            type: 'string',
            label: [{ languageCode: LanguageCode.es, value: 'ID de transportadora en Mi Paquete' }],
        },
    },
    init: async (injector: Injector) => {
        mipaqueteService = injector.get(MipaqueteService);
    },
    check: async (ctx: RequestContext, order: Order, args) => {
        if (await mipaqueteService.isBogotaOwnShippingEligible(ctx, order)) return false;
        const quote = await mipaqueteService.getOrRefreshQuote(ctx, order);
        if (!quote) return false;
        return quote.some(option => option.deliveryCompanyId === args.deliveryCompanyId);
    },
});

export const mipaqueteCarrierCalculator = new ShippingCalculator({
    code: 'mipaquete-carrier-calculator',
    description: [{ languageCode: LanguageCode.es, value: 'Usa el precio real cotizado con Mi Paquete para esta transportadora' }],
    args: {
        deliveryCompanyId: {
            type: 'string',
            label: [{ languageCode: LanguageCode.es, value: 'ID de transportadora en Mi Paquete' }],
        },
    },
    init: async (injector: Injector) => {
        mipaqueteService = injector.get(MipaqueteService);
    },
    calculate: async (ctx: RequestContext, order: Order, args) => {
        const quote = await mipaqueteService.getOrRefreshQuote(ctx, order);
        const option = quote?.find(o => o.deliveryCompanyId === args.deliveryCompanyId);
        // Should never happen if the checker already returned true (same cache), but a calculator
        // must return *something* — 0 rather than throwing, since the checker is the real gate and
        // an inconsistent read here shouldn't crash checkout.
        return {
            price: option ? Math.round(option.shippingCost * 100) : 0,
            priceIncludesTax: true,
            taxRate: 0,
            metadata: option ? { shippingTimeMinutes: option.shippingTime, score: option.score } : undefined,
        };
    },
});
