/**
 * @description
 * The plugin can be configured using the following options:
 */
export interface PluginInitOptions {
    exampleOption?: string;
}

// Type-level declaration matching the `Product: [...]` adsEligible customField config in
// vendure-config.ts — TypeScript doesn't infer entity customFields shapes from that runtime
// config. Same pattern as patilandia-gifts/types.ts for Order's gift fields.
declare module '@vendure/core' {
    interface CustomProductFields {
        adsEligible: boolean;
    }
}
