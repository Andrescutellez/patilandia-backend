/**
 * Google's official Product Taxonomy (support.google.com/merchants/answer/6324436) is a huge
 * controlled vocabulary — per F1-4 in the vault's Feeds de Producto y SEO roadmap, Patilandia only
 * needs entries for category/pet-type combinations that actually have real products today, not
 * the full taxonomy imported wholesale.
 *
 * Keyed by (category FacetValue code, pet-type FacetValue code), not by display name — Google
 * splits almost everything pet-related by species (confirmed against the official taxonomy file,
 * taxonomy-with-ids.en-US.txt, 2026-09-29): "Alimentos" alone needs two different entries
 * depending on whether it's cat or dog food, there's no generic "Pet Food" node to fall back to.
 * Values are the exact category path text Google's `google_product_category` field accepts
 * (the numeric id is noted in each comment only for cross-checking against the taxonomy file, it
 * is NOT part of the stored value).
 *
 * Add a row here — never inline a category string inside a feed generator — whenever a new
 * category/pet-type combination gets its first real product. Every combination without a row
 * here resolves to null (F1-6's generator must treat that as "omit the field", never guess).
 */
const GOOGLE_CATEGORY_MAP: Record<string, Partial<Record<'dogs' | 'cats', string>>> = {
    alimentos: {
        // id 3367
        cats: 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Food',
        // id 3530
        dogs: 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Food',
    },
};

export function resolveGoogleProductCategory(categoryCode: string | null, petTypeCode: string | null): string | null {
    if (!categoryCode || !petTypeCode) {
        return null;
    }
    return GOOGLE_CATEGORY_MAP[categoryCode]?.[petTypeCode as 'dogs' | 'cats'] ?? null;
}
