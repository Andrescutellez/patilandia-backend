import { FulfillmentHandler, LanguageCode } from '@vendure/core';

import { MIPAQUETE_FULFILLMENT_HANDLER_CODE } from '../constants';

/**
 * Used only by MipaqueteService.createShipmentForOrder() right after a real /createSending call
 * succeeds — never offered in the Dashboard's "Cumplir pedido" dialog as a manual option (an admin
 * fulfilling by hand still picks the existing 'manual-fulfillment', see
 * src/config/patilandia-fulfillment-handler.ts). `trackingCode` and `customFields.trackingUrl` start
 * empty here on purpose: Mi Paquete only returns the guide number/PDF later, asynchronously, via the
 * `urlForGuides` webhook — see api/mipaquete-webhook.middleware.ts, which updates this same
 * Fulfillment row directly (there is no native "update fulfillment" mutation in Vendure).
 */
export const mipaqueteFulfillmentHandler = new FulfillmentHandler({
    code: MIPAQUETE_FULFILLMENT_HANDLER_CODE,
    description: [{ languageCode: LanguageCode.en, value: 'Automated shipment created via Mi Paquete' }],
    args: {
        method: { type: 'string', required: false },
        mpCode: { type: 'string', required: false },
    },
    createFulfillment: (ctx, orders, orderItems, args) => {
        return {
            method: args.method,
            customFields: { trackingUrl: null },
        };
    },
});
