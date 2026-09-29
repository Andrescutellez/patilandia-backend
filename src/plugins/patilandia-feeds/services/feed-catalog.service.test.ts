import type { Product, ProductVariant, Translated } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { buildNormalizedProduct, FeedCatalogService, HydratedVariant } from './feed-catalog.service';

function fakeProduct(overrides: Record<string, unknown> = {}): Translated<Product> {
    return {
        id: '10',
        slug: 'comida-para-gato-hills',
        description: 'Alimento clínicamente formulado.',
        customFields: { includeInFeed: true, adsEligible: false },
        facetValues: [{ facet: { code: 'category' }, name: 'Alimentos' }],
        assets: [],
        featuredAsset: { id: '1', preview: 'https://api.patilandia.com.co/assets/preview/featured.jpg' },
        ...overrides,
    } as unknown as Translated<Product>;
}

function fakeHydratedVariant(overrides: Partial<HydratedVariant> = {}): HydratedVariant {
    return {
        variant: {
            sku: 'BG00044',
            name: 'Comida para gato Hills k/d 4lbs',
            customFields: { compareAtPrice: null, weightKg: 2 },
        } as unknown as Translated<ProductVariant>,
        priceWithTax: 6420000,
        saleableStockLevel: 5,
        ...overrides,
    };
}

const storefrontUrl = 'https://patilandia.com.co';
const currency = 'COP';

describe('buildNormalizedProduct', () => {
    it('uses the variant price as-is when there is no discount', () => {
        const result = buildNormalizedProduct({
            product: fakeProduct(),
            hydratedVariant: fakeHydratedVariant(),
            categoryPath: ['Alimentos'],
            storefrontUrl,
            currency,
        });
        expect(result.price).toBe(64200);
        expect(result.salePrice).toBeNull();
    });

    it('splits regular/sale price when compareAtPrice is a real discount', () => {
        const result = buildNormalizedProduct({
            product: fakeProduct(),
            hydratedVariant: fakeHydratedVariant({
                variant: {
                    sku: 'BG00044',
                    name: 'Comida para gato Hills k/d 4lbs',
                    customFields: { compareAtPrice: 7000000, weightKg: 2 },
                } as unknown as Translated<ProductVariant>,
                priceWithTax: 6420000,
            }),
            categoryPath: ['Alimentos'],
            storefrontUrl,
            currency,
        });
        expect(result.price).toBe(70000);
        expect(result.salePrice).toBe(64200);
    });

    it('ignores a compareAtPrice that is not actually higher than the real price', () => {
        const result = buildNormalizedProduct({
            product: fakeProduct(),
            hydratedVariant: fakeHydratedVariant({
                variant: {
                    sku: 'BG00044',
                    name: 'x',
                    customFields: { compareAtPrice: 5000000, weightKg: 2 },
                } as unknown as Translated<ProductVariant>,
                priceWithTax: 6420000,
            }),
            categoryPath: [],
            storefrontUrl,
            currency,
        });
        expect(result.price).toBe(64200);
        expect(result.salePrice).toBeNull();
    });

    it('reports out_of_stock when saleable stock is zero', () => {
        const result = buildNormalizedProduct({
            product: fakeProduct(),
            hydratedVariant: fakeHydratedVariant({ saleableStockLevel: 0 }),
            categoryPath: [],
            storefrontUrl,
            currency,
        });
        expect(result.availability).toBe('out_of_stock');
    });

    it('reports in_stock when saleable stock is positive', () => {
        const result = buildNormalizedProduct({
            product: fakeProduct(),
            hydratedVariant: fakeHydratedVariant({ saleableStockLevel: 3 }),
            categoryPath: [],
            storefrontUrl,
            currency,
        });
        expect(result.availability).toBe('in_stock');
    });

    it('reads brand from the "brand" facet, not any other facet', () => {
        const result = buildNormalizedProduct({
            product: fakeProduct({
                facetValues: [
                    { facet: { code: 'category' }, name: 'Alimentos' },
                    { facet: { code: 'brand' }, name: "Hill's" },
                ] as unknown as Translated<Product>['facetValues'],
            }),
            hydratedVariant: fakeHydratedVariant(),
            categoryPath: [],
            storefrontUrl,
            currency,
        });
        expect(result.brand).toBe("Hill's");
    });

    it('leaves brand null when the product has no brand facet', () => {
        const result = buildNormalizedProduct({
            product: fakeProduct({ facetValues: [] as unknown as Translated<Product>['facetValues'] }),
            hydratedVariant: fakeHydratedVariant(),
            categoryPath: [],
            storefrontUrl,
            currency,
        });
        expect(result.brand).toBeNull();
    });

    it('identifierExists is always false today — no GTIN/MPN exist in the data model yet, even with a real brand', () => {
        const result = buildNormalizedProduct({
            product: fakeProduct({
                facetValues: [{ facet: { code: 'brand' }, name: "Hill's" }] as unknown as Translated<Product>['facetValues'],
            }),
            hydratedVariant: fakeHydratedVariant(),
            categoryPath: [],
            storefrontUrl,
            currency,
        });
        expect(result.gtin).toBeNull();
        expect(result.mpn).toBeNull();
        expect(result.identifierExists).toBe(false);
    });

    it('puts the featured asset first and excludes it from the rest of the images', () => {
        const result = buildNormalizedProduct({
            product: fakeProduct({
                featuredAsset: { id: '1', preview: 'https://x/featured.jpg' } as unknown as Translated<Product>['featuredAsset'],
                assets: [
                    { assetId: '1', asset: { preview: 'https://x/featured.jpg' } },
                    { assetId: '2', asset: { preview: 'https://x/extra.jpg' } },
                ] as unknown as Translated<Product>['assets'],
            }),
            hydratedVariant: fakeHydratedVariant(),
            categoryPath: [],
            storefrontUrl,
            currency,
        });
        expect(result.images).toEqual(['https://x/featured.jpg', 'https://x/extra.jpg']);
    });

    it('falls back to the plain assets list when there is no featured asset', () => {
        const result = buildNormalizedProduct({
            product: fakeProduct({
                featuredAsset: undefined as unknown as Translated<Product>['featuredAsset'],
                assets: [{ assetId: '2', asset: { preview: 'https://x/only.jpg' } }] as unknown as Translated<Product>['assets'],
            }),
            hydratedVariant: fakeHydratedVariant(),
            categoryPath: [],
            storefrontUrl,
            currency,
        });
        expect(result.images).toEqual(['https://x/only.jpg']);
    });

    it('sets customLabel0 only when the product is marked adsEligible', () => {
        const eligible = buildNormalizedProduct({
            product: fakeProduct({ customFields: { includeInFeed: true, adsEligible: true } as unknown as Translated<Product>['customFields'] }),
            hydratedVariant: fakeHydratedVariant(),
            categoryPath: [],
            storefrontUrl,
            currency,
        });
        expect(eligible.customLabel0).toBe('alto-margen');

        const notEligible = buildNormalizedProduct({
            product: fakeProduct({ customFields: { includeInFeed: true, adsEligible: false } as unknown as Translated<Product>['customFields'] }),
            hydratedVariant: fakeHydratedVariant(),
            categoryPath: [],
            storefrontUrl,
            currency,
        });
        expect(notEligible.customLabel0).toBeNull();
    });

    it('uses the variant SKU as id and the product id as itemGroupId, so variants of the same product group together', () => {
        const result = buildNormalizedProduct({
            product: fakeProduct({ id: '10' as unknown as Translated<Product>['id'] }),
            hydratedVariant: fakeHydratedVariant(),
            categoryPath: [],
            storefrontUrl,
            currency,
        });
        expect(result.id).toBe('BG00044');
        expect(result.itemGroupId).toBe('10');
    });

    it('builds an absolute product URL from the storefront base URL and slug', () => {
        const result = buildNormalizedProduct({
            product: fakeProduct({ slug: 'comida-para-gato-hills' }),
            hydratedVariant: fakeHydratedVariant(),
            categoryPath: [],
            storefrontUrl,
            currency,
        });
        expect(result.productUrl).toBe('https://patilandia.com.co/producto/comida-para-gato-hills');
    });

    it('never populates googleProductCategory — that mapping table is F1-4, not built yet', () => {
        const result = buildNormalizedProduct({
            product: fakeProduct(),
            hydratedVariant: fakeHydratedVariant(),
            categoryPath: [],
            storefrontUrl,
            currency,
        });
        expect(result.googleProductCategory).toBeNull();
    });
});

/** A minimal product with N variants, matching the real shape FeedCatalogService reads. */
function fakeProductWithVariants(id: string, includeInFeed: boolean, variantSkus: string[]) {
    return fakeProduct({
        id,
        customFields: { includeInFeed, adsEligible: false },
        variants: variantSkus.map(sku => ({
            sku,
            name: sku,
            customFields: { compareAtPrice: null, weightKg: 1 },
        })),
    });
}

describe('FeedCatalogService.getNormalizedProducts', () => {
    // Each entry is one page's { items, totalItems } exactly as findAll would return it — the
    // caller controls totalItems directly so a test can force the skip/totalItems loop to walk
    // more than one page even though the fake data itself is tiny.
    function makeService(pages: { items: ReturnType<typeof fakeProductWithVariants>[]; totalItems: number }[]) {
        const remaining = [...pages];
        const productService = {
            findAll: vi.fn(async () => remaining.shift() ?? { items: [], totalItems: 0 }),
        };
        const productVariantService = {
            applyChannelPriceAndTax: vi.fn(async (variant: Translated<ProductVariant>) => ({ ...variant, priceWithTax: 1000 })),
            getSaleableStockLevel: vi.fn(async () => 5),
        };
        const collectionService = {
            getCollectionsByProductId: vi.fn(async () => []),
        };
        const ctx = { channel: { defaultCurrencyCode: 'COP' } };
        const service = new FeedCatalogService(
            productService as never,
            productVariantService as never,
            collectionService as never,
            { storefrontUrl },
        );
        return { service, ctx: ctx as never };
    }

    it('excludes products with includeInFeed: false, even though the query already filtered enabled: true', async () => {
        const items = [fakeProductWithVariants('1', true, ['A']), fakeProductWithVariants('2', false, ['B'])];
        const { service, ctx } = makeService([{ items, totalItems: items.length }]);
        const result = await service.getNormalizedProducts(ctx);
        expect(result.map(r => r.id)).toEqual(['A']);
    });

    it('produces exactly one row per variant, never duplicated, across multiple products', async () => {
        const items = [fakeProductWithVariants('1', true, ['A', 'B']), fakeProductWithVariants('2', true, ['C'])];
        const { service, ctx } = makeService([{ items, totalItems: items.length }]);
        const result = await service.getNormalizedProducts(ctx);
        const ids = result.map(r => r.id);
        expect(ids).toEqual(['A', 'B', 'C']);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('walks every page instead of stopping after the first (totalItems bigger than one page)', async () => {
        // totalItems is deliberately bigger than either page's real length, forcing skip (0, then
        // 100) to stay below totalItems until after the second call — real production pages would
        // be 100 items each; these fakes just need the loop to actually make a second call.
        const { service, ctx } = makeService([
            { items: [fakeProductWithVariants('1', true, ['A'])], totalItems: 150 },
            { items: [fakeProductWithVariants('2', true, ['B'])], totalItems: 150 },
        ]);
        const result = await service.getNormalizedProducts(ctx);
        expect(result.map(r => r.id).sort()).toEqual(['A', 'B']);
    });
});
