/**
 * @description
 * The plugin can be configured using the following options:
 */
export interface PluginInitOptions {
    exampleOption?: string;
}

// Type-level declaration matching the `Order: [...]` customFields config in vendure-config.ts —
// TypeScript doesn't infer entity customFields shapes from that runtime config, so accessing
// order.customFields.loyaltyPointsEarned/loyaltyPointsRedeemed needs this augmentation.
declare module '@vendure/core' {
    interface CustomOrderFields {
        loyaltyPointsEarned: number;
        loyaltyPointsRedeemed: number;
    }
}
