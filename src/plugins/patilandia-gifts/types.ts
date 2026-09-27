/**
 * @description
 * The plugin can be configured using the following options:
 */
export interface PluginInitOptions {
    exampleOption?: string;
}

// Type-level declaration matching the `Order: [...]` gift customFields config in vendure-config.ts —
// TypeScript doesn't infer entity customFields shapes from that runtime config, so reading
// order.customFields.isGift (needed by the email handlers, see src/email/) needs this augmentation.
// Same pattern as patilandia-loyalty/types.ts for loyaltyPointsEarned/loyaltyPointsRedeemed.
declare module '@vendure/core' {
    interface CustomOrderFields {
        isGift: boolean;
        giftWrap: boolean;
        giftMessage: string | null;
        giftSenderName: string | null;
        giftAnonymous: boolean;
    }
}
