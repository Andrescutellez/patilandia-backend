import { Injector, LanguageCode, Order, RequestContext, ShippingCalculator, ShippingEligibilityChecker } from '@vendure/core';

import { MipaqueteService } from '../services/mipaquete.service';

let mipaqueteService: MipaqueteService;

// Same code/duplicated-constant convention as src/email/order-timing.ts's isCashOnDelivery — this
// plugin doesn't import across the patilandia-loyalty plugin boundary for one string.
const CASH_ON_DELIVERY_PAYMENT_METHOD_CODE = 'cash-on-delivery';

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
        // A contraentrega shipment costs Mi Paquete more to handle (they collect cash on our
        // behalf) — collectionCommissionWithRate is that extra cost, charged to Patilandia on top
        // of shippingCost. Passed on to the shopper rather than absorbed, per explicit confirmation.
        // paymentMethodIntent is set by the storefront (setOrderCustomFields) as soon as the
        // shopper picks a payment method, before shipping methods are quoted — see vendure-config.ts.
        const isCod = order.customFields.paymentMethodIntent === CASH_ON_DELIVERY_PAYMENT_METHOD_CODE;
        const codCommission = isCod ? (option?.collectionCommissionWithRate ?? 0) : 0;
        // Should never happen if the checker already returned true (same cache), but a calculator
        // must return *something* — 0 rather than throwing, since the checker is the real gate and
        // an inconsistent read here shouldn't crash checkout.
        const rawPrice = option ? Math.round((option.shippingCost + codCommission) * 100) : 0;
        // Subsidy/free-shipping-threshold applied last, on the full customer-facing price
        // (shippingCost + codCommission combined) — the shopper only ever sees one number, so it's
        // that whole line that gets discounted, never just the base shippingCost. Never changes
        // what productInformation/paymentType send to Mi Paquete's own /createSending later.
        const price = option ? await mipaqueteService.applyCarrierShippingPricing(ctx, order, rawPrice) : 0;
        return {
            price,
            priceIncludesTax: true,
            taxRate: 0,
            metadata: option ? { shippingTimeMinutes: option.shippingTime, score: option.score } : undefined,
        };
    },
});
