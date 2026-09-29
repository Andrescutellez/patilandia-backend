/**
 * @description
 * The plugin can be configured using the following options:
 */
export interface PluginInitOptions {
    /** Public storefront URL, used to build absolute product/category links — same value the rest
     *  of vendure-config.ts already threads through as `storefrontUrl` (see PatilandiaBoldPlugin
     *  for the identical pattern). */
    storefrontUrl: string;
}

/** Google/Meta both support `preorder`/`backorder` too, but nothing in Patilandia's data model
 *  represents either today (stock is just a saleable count) — left out rather than guessed at,
 *  per F1-3 in the vault's Feeds roadmap ("no inventar lógica que no aplica"). */
export type FeedAvailability = 'in_stock' | 'out_of_stock';

/** Always 'new' — Patilandia doesn't sell used/refurbished goods. Kept as its own type (not a
 *  literal inlined on NormalizedProduct) so a generator can narrow on it without magic strings. */
export type FeedCondition = 'new';

/**
 * One row per Vendure ProductVariant — this is what every feed generator (Google/Meta/TikTok)
 * reads from, never Vendure directly (see the vault's Feeds de Producto y SEO — Roadmap, F1-2).
 * Field-by-field provenance:
 *  - price/salePrice/availability: F1-3 in the roadmap.
 *  - images/productUrl/variantUrl/categoryPath/googleProductCategory: F1-4.
 *  - brand/gtin/mpn/identifierExists/customLabel0: F1-5 and F1-1's adsEligible checklist.
 * `googleProductCategory` is always null for now — F1-4 still owns building the real category
 * mapping table; nothing populates it yet.
 */
export interface NormalizedProduct {
    /** Unique per variant — the ProductVariant SKU (Google's required `id`). */
    id: string;
    /** Vendure Product.id — groups this variant's siblings under one listing (Google's
     *  `item_group_id`). */
    itemGroupId: string;
    title: string;
    description: string;
    productUrl: string;
    variantUrl: string;
    /** [0] is the primary/`image_link` (must be the clean one — see F0-5's confirmed rule); the
     *  rest are `additional_image_link`, no restriction. */
    images: string[];
    /** Regular/list price, decimal (not minor units) — what Google calls `price`. */
    price: number;
    /** Current discounted price when lower than `price`; null when not on sale. */
    salePrice: number | null;
    currency: string;
    availability: FeedAvailability;
    condition: FeedCondition;
    brand: string | null;
    gtin: string | null;
    mpn: string | null;
    /** Google requires this explicit when brand+gtin+mpn aren't all real — never omit the field. */
    identifierExists: boolean;
    /** Collection names the product belongs to, root-first. */
    categoryPath: string[];
    /** Google's own taxonomy id/path — null until F1-4 builds the mapping table. */
    googleProductCategory: string | null;
    /** From `Product.customFields.adsEligible` (F1-1) — e.g. `"alto-margen"` or null. */
    customLabel0: string | null;
    weightKg: number | null;
}

// Type-level declaration matching the `Product: [...]` includeInFeed/adsEligible customField
// config in vendure-config.ts — TypeScript doesn't infer entity customFields shapes from that
// runtime config. Same pattern as patilandia-gifts/types.ts for Order's gift fields.
declare module '@vendure/core' {
    interface CustomProductFields {
        includeInFeed: boolean;
        adsEligible: boolean;
    }
}
