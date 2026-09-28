// Type-level declarations matching the customFields config in vendure-config.ts — TypeScript
// doesn't infer entity customFields shapes from that runtime config, so reading
// productVariant.customFields.weightKg/length/width/height (needed by packing.ts's caller in
// mipaquete.service.ts) and order.shippingAddress.customFields.locationCode (needed by the
// shipping checkers) needs this augmentation. Same pattern as patilandia-gifts/types.ts for Order's
// gift fields, or src/config/patilandia-fulfillment-handler.ts for Fulfillment.trackingUrl.
//
// weightKg/shippingClass/compareAtPrice already existed as ProductVariant customFields before this
// plugin (see adapters.ts in the storefront, which reads them over GraphQL) but were never given a
// backend-side TS augmentation until now, since nothing in patilandia-vendure's own TypeScript code
// needed to read them directly before this plugin.
declare module '@vendure/core' {
    interface CustomProductVariantFields {
        weightKg: number | null;
        length: number;
        width: number;
        height: number;
        shippingClass: string | null;
        compareAtPrice: number | null;
    }

    interface CustomAddressFields {
        neighborhood: string | null;
        deliveryNotes: string | null;
        locationCode: string | null;
    }

    interface CustomOrderFields {
        paymentMethodIntent: string | null;
    }
}
