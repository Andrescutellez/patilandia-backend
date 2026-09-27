import { FulfillmentHandler, LanguageCode } from '@vendure/core';

// Type-level declaration matching the `Fulfillment: [...]` customFields config in
// vendure-config.ts — TypeScript doesn't infer entity customFields shapes from that runtime
// config, so reading fulfillment.customFields.trackingUrl (needed by order-state-change-handler.ts
// and the "Ver tu pedido" storefront page) needs this augmentation. Same pattern as
// patilandia-gifts/types.ts for Order's gift fields.
declare module '@vendure/core' {
    interface CustomFulfillmentFields {
        trackingUrl: string | null;
    }
}

/**
 * Same `code` as @vendure/core's built-in manualFulfillmentHandler ('manual-fulfillment') so it's
 * a drop-in replacement — configure-checkout.ts already set every ShippingMethod's
 * `fulfillmentHandler` to that exact code, and this way nothing on those records needs to change.
 * Adds one more optional arg on top of the original two (method, trackingCode): trackingUrl, so
 * an admin can paste the carrier's real tracking-page link when marking an order as shipped in
 * the Dashboard — it renders there for free, the same generic form Vendure already builds for any
 * FulfillmentHandler's args, no custom Dashboard UI needed. Left blank, `trackingUrl` stays null
 * and nothing related to it shows up in the confirmation email or "/pedido/[code]" page.
 */
export const patilandiaFulfillmentHandler = new FulfillmentHandler({
    code: 'manual-fulfillment',
    description: [{ languageCode: LanguageCode.en, value: 'Manually enter fulfillment details' }],
    args: {
        method: {
            type: 'string',
            required: false,
            label: [{ languageCode: LanguageCode.es, value: 'Transportadora' }],
        },
        trackingCode: {
            type: 'string',
            required: false,
            label: [{ languageCode: LanguageCode.es, value: 'Número de guía' }],
        },
        trackingUrl: {
            type: 'string',
            required: false,
            label: [{ languageCode: LanguageCode.es, value: 'Enlace de rastreo (opcional)' }],
        },
    },
    createFulfillment: (ctx, orders, orderItems, args) => {
        return {
            method: args.method,
            trackingCode: args.trackingCode,
            customFields: { trackingUrl: args.trackingUrl || null },
        };
    },
});
