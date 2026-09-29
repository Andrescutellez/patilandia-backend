import { Inject, Injectable } from '@nestjs/common';
import {
    CollectionService,
    Logger,
    Product,
    ProductService,
    ProductVariant,
    ProductVariantService,
    RequestContext,
    Translated,
} from '@vendure/core';

import { PATILANDIA_FEEDS_PLUGIN_OPTIONS, loggerCtx } from '../constants';
import { NormalizedProduct, PluginInitOptions } from '../types';

/** Vendure stores money as an integer in the currency's minor unit (COP has none in practice, but
 *  the API still works in "cents" — same convention as the storefront's VENDURE_MONEY_FACTOR). */
const MONEY_MINOR_UNIT_FACTOR = 100;

const PAGE_SIZE = 100;

/** Everything one variant needs, already resolved through the real Vendure services (not raw
 *  entity fields — price/stock are computed at read time, see ProductVariantService). Kept
 *  separate from the pure mapper below so the mapper itself needs no live services to test. */
export interface HydratedVariant {
    variant: Translated<ProductVariant>;
    priceWithTax: number;
    saleableStockLevel: number;
}

/** Pure — no Vendure services, no I/O. Takes already-hydrated data and produces one
 *  NormalizedProduct row. Exported so F1-2's tests can cover pricing/availability edge cases
 *  without a database. */
export function buildNormalizedProduct(params: {
    product: Translated<Product>;
    hydratedVariant: HydratedVariant;
    categoryPath: string[];
    storefrontUrl: string;
    currency: string;
}): NormalizedProduct {
    const { product, hydratedVariant, categoryPath, storefrontUrl, currency } = params;
    const { variant, priceWithTax, saleableStockLevel } = hydratedVariant;

    const brand = product.facetValues.find(fv => fv.facet.code === 'brand')?.name ?? null;
    const compareAtPriceMinorUnits = variant.customFields.compareAtPrice;
    const isOnSale = Boolean(compareAtPriceMinorUnits) && compareAtPriceMinorUnits! > priceWithTax;
    const regularPriceMinorUnits = isOnSale ? compareAtPriceMinorUnits! : priceWithTax;
    const salePriceMinorUnits = isOnSale ? priceWithTax : null;

    const images = [
        product.featuredAsset?.preview,
        ...product.assets.filter(a => a.assetId !== product.featuredAsset?.id).map(a => a.asset.preview),
    ].filter((url): url is string => Boolean(url));

    // No GTIN/MPN anywhere in Patilandia's data model today (confirmed by grep across the
    // codebase, F1-5 in the roadmap) — identifierExists is deliberately always false rather than
    // omitted, per Google's own rule for products without real identifiers.
    const gtin: string | null = null;
    const mpn: string | null = null;
    const identifierExists = Boolean(brand && (gtin || mpn));

    return {
        id: variant.sku,
        itemGroupId: String(product.id),
        title: variant.name,
        description: product.description,
        productUrl: `${storefrontUrl}/producto/${product.slug}`,
        variantUrl: `${storefrontUrl}/producto/${product.slug}`,
        images,
        price: regularPriceMinorUnits / MONEY_MINOR_UNIT_FACTOR,
        salePrice: salePriceMinorUnits !== null ? salePriceMinorUnits / MONEY_MINOR_UNIT_FACTOR : null,
        currency,
        availability: saleableStockLevel > 0 ? 'in_stock' : 'out_of_stock',
        condition: 'new',
        brand,
        gtin,
        mpn,
        identifierExists,
        categoryPath,
        googleProductCategory: null,
        customLabel0: product.customFields.adsEligible ? 'alto-margen' : null,
        weightKg: variant.customFields.weightKg ?? null,
    };
}

/**
 * Hydrates the real Vendure catalog into NormalizedProduct[] — the single source every feed
 * generator (Google/Meta/TikTok, F1-6 onward) reads from. See the vault's Feeds de Producto y SEO
 * — Roadmap, F1-2, for the full design rationale.
 */
@Injectable()
export class FeedCatalogService {
    constructor(
        private productService: ProductService,
        private productVariantService: ProductVariantService,
        private collectionService: CollectionService,
        @Inject(PATILANDIA_FEEDS_PLUGIN_OPTIONS) private options: PluginInitOptions,
    ) {}

    /** Every enabled, `includeInFeed`-opted-in product's variants, normalized. Paginates for
     *  real (not a single `take: 100`, see the same problem already found in the storefront's
     *  getStorefrontProducts) — fine to revisit if the catalog ever grows past a few hundred
     *  products, not a real concern at today's size. */
    async getNormalizedProducts(ctx: RequestContext): Promise<NormalizedProduct[]> {
        const currency = ctx.channel.defaultCurrencyCode;
        const normalized: NormalizedProduct[] = [];

        let skip = 0;
        for (;;) {
            const { items, totalItems } = await this.productService.findAll(
                ctx,
                { skip, take: PAGE_SIZE, filter: { enabled: { eq: true } } },
                ['facetValues.facet', 'assets.asset', 'featuredAsset', 'variants'],
            );

            for (const product of items) {
                if (!product.customFields.includeInFeed) {
                    continue;
                }
                normalized.push(...(await this.normalizeProduct(ctx, product, currency)));
            }

            skip += PAGE_SIZE;
            if (skip >= totalItems) {
                break;
            }
        }

        return normalized;
    }

    private async normalizeProduct(
        ctx: RequestContext,
        product: Translated<Product>,
        currency: string,
    ): Promise<NormalizedProduct[]> {
        const collections = await this.collectionService.getCollectionsByProductId(ctx, product.id, true);
        const categoryPath = collections.map(c => c.name);

        const results: NormalizedProduct[] = [];
        for (const variant of product.variants) {
            const withPrice = await this.productVariantService.applyChannelPriceAndTax(variant, ctx);
            const saleableStockLevel = await this.productVariantService.getSaleableStockLevel(ctx, variant);

            try {
                results.push(
                    buildNormalizedProduct({
                        product,
                        hydratedVariant: { variant, priceWithTax: withPrice.priceWithTax, saleableStockLevel },
                        categoryPath,
                        storefrontUrl: this.options.storefrontUrl,
                        currency,
                    }),
                );
            } catch (err) {
                // One malformed variant shouldn't take down the whole feed — same diagnostic
                // pattern the roadmap calls for in F1-6 (Google generator), applied here too since
                // hydration is where a bad customField value would actually throw.
                Logger.error(
                    `No se pudo normalizar la variante ${variant.sku} (producto ${product.name}): ${
                        err instanceof Error ? err.message : String(err)
                    }`,
                    loggerCtx,
                );
            }
        }
        return results;
    }
}
