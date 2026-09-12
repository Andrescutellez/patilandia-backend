/**
 * Seeds the real Patilandia catalog into Vendure, replacing the generic sample data that
 * `@vendure/create --ci` populates by default. Run with:
 *
 *   npx ts-node src/scripts/seed-patilandia.ts
 *
 * Safe to re-run: it wipes the sample/demo catalog first, then recreates the Patilandia
 * catalog from scratch every time (idempotent by design, not by diffing).
 *
 * ⚠️ NO LONGER SAFE ONCE THERE IS REAL DATA ATTACHED TO A PRODUCT. Wiping a product deletes it
 * (soft-delete) and the next run recreates it with a brand-new id — anything with a foreign key
 * to the old id gets cascade-deleted along with it. Product reviews (patilandia-reviews plugin,
 * `ON DELETE CASCADE`) are the first real example of this. Don't re-run this script against a
 * database with real customer reviews (or, eventually, real orders) without a plan for that.
 *
 * ⚠️ ON A BRAND-NEW DATABASE, RUN configure-checkout.ts FIRST. Creating priced ProductVariants
 * here requires the channel to already have an active tax zone (Vendure's ProductPriceApplicator
 * throws `error.no-active-tax-zone` otherwise) — configure-checkout.ts is what creates and assigns
 * that zone. On a local dev database this was never an issue because @vendure/create's initial-data
 * population leaves some default tax zone assigned from the start; a freshly-cloned checkout
 * against an empty database (e.g. a new server) has none until configure-checkout.ts runs.
 *

 * Data model notes (see the migration plan for the full rationale):
 * - Medusa's free-form `metadata` blob per product is replaced by real Vendure primitives:
 *   category -> Facet "category" + a matching Collection (auto-populated via facet-value
 *   filter), theme -> Facet "theme" + matching Collection, petType -> Facet "pet-type",
 *   size/color -> real ProductOptionGroups driving real ProductVariants (was a single
 *   "Única" variant + metadata hack in Medusa), everything else -> typed custom fields.
 * - Vendure stores Money as an integer in the currency's minor unit. COP has 2 ISO 4217
 *   decimal places (it is not in Vendure's zero-decimal currency list), so a price of
 *   149900 (Colombian pesos, no cents shown anywhere in the storefront) is stored as
 *   14990000. MONEY_FACTOR below makes that conversion explicit instead of a magic number.
 */
import {
    bootstrapWorker,
    ChannelService,
    CollectionService,
    CurrencyCode,
    FacetService,
    FacetValueService,
    GlobalSettingsService,
    LanguageCode,
    Logger,
    ProductOptionGroupService,
    ProductOptionService,
    ProductService,
    ProductVariantService,
    AssetService,
    RequestContext,
    RequestContextService,
} from '@vendure/core';
import { AssetImporter } from '@vendure/core';

import { config } from '../vendure-config';

const loggerCtx = 'SeedPatilandia';
const MONEY_FACTOR = 100; // COP has 2 decimal places in Vendure's currency precision table.

interface SeedColor {
    name: string;
    hex: string;
}

interface SeedProduct {
    slug: string;
    sku: string;
    name: string;
    categorySlug: CategorySlug;
    themeSlug: ThemeSlug;
    petType?: 'dogs' | 'cats';
    shortDescription: string;
    description: string;
    images: string[]; // filenames inside patilandia/public/images/patilandia
    price: number; // COP, pesos (not cents) — matches the storefront's mock data today
    compareAtPrice?: number;
    rating: number;
    reviewCount: number;
    badge?: string;
    colors: SeedColor[];
    sizes: string[];
    materials: string[];
    care: string[];
    shippingClass: 'standard' | 'bulky' | 'heavy' | 'custom';
    weightKg: number;
    stock: number;
}

const CATEGORY_SLUGS = [
    'camitas',
    'juguetes',
    'alimentos',
    'accesorios',
    'higiene',
    'transporte',
    'ropa',
] as const;
type CategorySlug = (typeof CATEGORY_SLUGS)[number];

const THEME_SLUGS = ['royal', 'galaxy', 'magic', 'safari', 'dreams'] as const;
type ThemeSlug = (typeof THEME_SLUGS)[number];

const categories: Record<CategorySlug, { name: string; tagline: string; description: string; icon: string; image: string }> = {
    camitas: {
        name: 'Camitas',
        tagline: 'Descanso con magia',
        description: 'Nuestro universo textil premium para perros y gatos.',
        icon: 'bed',
        image: 'categoria camas.png',
    },
    juguetes: {
        name: 'Juguetes',
        tagline: 'Diversión encantada',
        description: 'Peluches, mordedores y estímulos para jugar en serio.',
        icon: 'ball',
        image: 'categoria juguetes.png',
    },
    alimentos: {
        name: 'Alimentos',
        tagline: 'Nutrición feliz',
        description: 'Comida y snacks elegidos para su bienestar diario.',
        icon: 'bowl',
        image: 'categoria comida.png',
    },
    accesorios: {
        name: 'Accesorios',
        tagline: 'Estilo y comodidad',
        description: 'Collares, placas y esenciales para paseos con personalidad.',
        icon: 'collar',
        image: 'categoria accesorios.png',
    },
    higiene: {
        name: 'Higiene',
        tagline: 'Rutinas suaves',
        description: 'Cepillos, tapetes y soluciones pensadas para el cuidado diario.',
        icon: 'brush',
        image: 'categoria higiene.png',
    },
    transporte: {
        name: 'Transporte',
        tagline: 'Viajes tranquilos',
        description: 'Morrales, guacales y opciones seguras para moverse juntos.',
        icon: 'carrier',
        image: 'categoria viaje.png',
    },
    ropa: {
        name: 'Ropa',
        tagline: 'Capas encantadas',
        description: 'Textiles para clima, foto o paseo con identidad Patilandia.',
        icon: 'shirt',
        image: 'categoria ropa.png',
    },
};

const themes: Record<ThemeSlug, { title: string; subtitle: string; description: string; image: string }> = {
    royal: {
        title: 'Royal',
        subtitle: 'Princesas y príncipes',
        description: 'Castillos suaves, acabados dorados y protagonismo absoluto.',
        image: 'royal-bed.png',
    },
    galaxy: {
        title: 'Galaxy',
        subtitle: 'Dormir entre estrellas',
        description: 'Una colección nocturna con volumen, brillo y calma espacial.',
        image: 'galaxy-bed.png',
    },
    magic: {
        title: 'Magic Forest',
        subtitle: 'Bosques encantados',
        description: 'Texturas orgánicas, hojas bordadas y una vibra mística premium.',
        image: 'forest-bed.png',
    },
    safari: {
        title: 'Safari',
        subtitle: 'Aventura cálida',
        description: 'Tonos arena, siluetas suaves y energía de exploración tierna.',
        image: 'safari-bed.png',
    },
    dreams: {
        title: 'Dreams',
        subtitle: 'Luna, nube y descanso',
        description: 'Una línea nocturna para siestas memorables y calma total.',
        image: 'dreams-bed.png',
    },
};

const defaultColors: SeedColor[] = [
    { name: 'Lavanda', hex: '#8b73ff' },
    { name: 'Crema', hex: '#f7efe3' },
    { name: 'Dorado suave', hex: '#f2c76f' },
];

const defaultMaterials = ['Microfibra premium', 'Relleno siliconado', 'Base antideslizante'];
const defaultCare = ['Lavar a mano', 'Secar extendida', 'No usar blanqueador'];
const SIZES = ['S', 'M', 'L', 'XL'];

const products: SeedProduct[] = [
    {
        slug: 'camita-castillo-real',
        sku: 'PAT-ROYAL-001',
        name: 'Camita Castillo Real',
        categorySlug: 'camitas',
        themeSlug: 'royal',
        shortDescription: 'La cama insignia de Patilandia con acabado castillo y tacto nube.',
        description:
            'Inspirada en un reino suave y encantado, esta camita combina volumen, soporte, detalles bordados y una silueta inolvidable para dormir como realeza.',
        images: ['royal-bed.png', 'hero-fantasy.png', 'dreams-bed.png'],
        price: 149900,
        compareAtPrice: 189900,
        rating: 4.9,
        reviewCount: 124,
        badge: 'Más vendido',
        colors: [
            { name: 'Rosa princesa', hex: '#f08ac3' },
            { name: 'Azul reino', hex: '#4c63d7' },
            { name: 'Lila sueño', hex: '#9a7cf8' },
        ],
        sizes: SIZES,
        materials: defaultMaterials,
        care: defaultCare,
        shippingClass: 'bulky',
        weightKg: 4.2,
        stock: 18,
    },
    {
        slug: 'camita-galaxy-orbit',
        sku: 'PAT-GALAXY-002',
        name: 'Camita Galaxy Orbit',
        categorySlug: 'camitas',
        themeSlug: 'galaxy',
        petType: 'cats',
        shortDescription: 'Una nave mullida para gatos curiosos y siestas espaciales.',
        description:
            'Un diseño envolvente con estética cósmica y costuras luminosas para gatos que aman observar, estirarse y descansar con estilo.',
        images: ['galaxy-bed.png', 'dreams-bed.png', 'hero-fantasy.png'],
        price: 139900,
        compareAtPrice: 169900,
        rating: 4.8,
        reviewCount: 98,
        badge: 'Nuevo',
        colors: defaultColors,
        sizes: SIZES,
        materials: defaultMaterials,
        care: defaultCare,
        shippingClass: 'standard',
        weightKg: 2.8,
        stock: 18,
    },
    {
        slug: 'camita-bosque-encantado',
        sku: 'PAT-MAGIC-003',
        name: 'Camita Bosque Encantado',
        categorySlug: 'camitas',
        themeSlug: 'magic',
        shortDescription: 'Hojas bordadas, tonos bosque y una sensación de refugio absoluto.',
        description:
            'Ideal para peluditos que aman acurrucarse. Sus bordes altos crean contención suave y una experiencia más tranquila.',
        images: ['forest-bed.png', 'hero-fantasy.png'],
        price: 134900,
        compareAtPrice: 159900,
        rating: 4.7,
        reviewCount: 76,
        colors: defaultColors,
        sizes: SIZES,
        materials: defaultMaterials,
        care: defaultCare,
        shippingClass: 'bulky',
        weightKg: 3.6,
        stock: 18,
    },
    {
        slug: 'camita-safari-leon',
        sku: 'PAT-SAFARI-004',
        name: 'Camita Safari León',
        categorySlug: 'camitas',
        themeSlug: 'safari',
        shortDescription: 'Una silueta cálida, aventurera y abrazable para siestas intensas.',
        description:
            'Con una presencia escultural y tonos tierra suaves, esta cama aporta un carácter propio al espacio de tu mascota.',
        images: ['safari-bed.png', 'forest-bed.png'],
        price: 139900,
        compareAtPrice: 164900,
        rating: 4.8,
        reviewCount: 89,
        colors: defaultColors,
        sizes: SIZES,
        materials: defaultMaterials,
        care: defaultCare,
        shippingClass: 'bulky',
        weightKg: 3.9,
        stock: 18,
    },
    {
        slug: 'camita-luna-estrellas',
        sku: 'PAT-DREAMS-005',
        name: 'Camita Luna y Estrellas',
        categorySlug: 'camitas',
        themeSlug: 'dreams',
        shortDescription: 'Una luna acolchada para cerrar el día en calma total.',
        description:
            'Diseñada para aportar soporte y una estética soñadora, perfecta para cuartos, estudios y esquinas premium del hogar.',
        images: ['dreams-bed.png', 'hero-fantasy.png', 'galaxy-bed.png'],
        price: 129900,
        compareAtPrice: 149900,
        rating: 4.9,
        reviewCount: 112,
        badge: 'Top regalo',
        colors: defaultColors,
        sizes: SIZES,
        materials: defaultMaterials,
        care: defaultCare,
        shippingClass: 'standard',
        weightKg: 2.2,
        stock: 18,
    },
    {
        slug: 'camita-personalizada-luna',
        sku: 'PAT-CUSTOM-006',
        name: 'Camita Personalizada Luna',
        categorySlug: 'camitas',
        themeSlug: 'dreams',
        shortDescription: 'El producto propio diferencial de Patilandia, listo para bordar su nombre.',
        description: 'Personaliza color, tamaño y nombre para convertir su descanso en una pieza única de la casa.',
        images: ['hero-fantasy.png', 'dreams-bed.png'],
        price: 179900,
        compareAtPrice: 209900,
        rating: 4.9,
        reviewCount: 64,
        badge: 'Personalizable',
        colors: defaultColors,
        sizes: SIZES,
        materials: defaultMaterials,
        care: defaultCare,
        shippingClass: 'custom',
        weightKg: 4.4,
        stock: 18,
    },
    {
        slug: 'cojin-artesanal-nube',
        sku: 'PAT-TEXTIL-007',
        name: 'Cojín Artesanal Nube',
        categorySlug: 'accesorios',
        themeSlug: 'dreams',
        shortDescription: 'Un apoyo decorativo y funcional para rincones mágicos.',
        description: 'Ideal para complementar la camita o crear zonas de descanso flexibles dentro del hogar.',
        images: ['dreams-bed.png'],
        price: 69900,
        compareAtPrice: 89900,
        rating: 4.7,
        reviewCount: 45,
        badge: 'Hecho a mano',
        colors: defaultColors,
        sizes: SIZES,
        materials: defaultMaterials,
        care: defaultCare,
        shippingClass: 'standard',
        weightKg: 1.1,
        stock: 18,
    },
    {
        slug: 'snack-crunch-pollo',
        sku: 'PAT-SNACK-008',
        name: 'Snack Crunch Pollo',
        categorySlug: 'alimentos',
        themeSlug: 'dreams',
        shortDescription: 'Un premio práctico para sumar a tus compras recurrentes.',
        description: 'Perfecto para acompañar rutinas, entrenamiento y momentos de cariño durante la semana.',
        images: ['royal-bed.png'],
        price: 25900,
        compareAtPrice: 31900,
        rating: 4.8,
        reviewCount: 53,
        badge: 'Recurrencia',
        colors: defaultColors,
        sizes: SIZES,
        materials: defaultMaterials,
        care: defaultCare,
        shippingClass: 'heavy',
        weightKg: 8.5,
        stock: 18,
    },
];

const highlights = [
    { title: 'Materiales premium', description: 'Fibras suaves, estructura cómoda y acabados duraderos.', icon: 'sparkles' },
    { title: 'Funda removible', description: 'Facilita la limpieza y extiende la vida útil del producto.', icon: 'shield' },
    { title: 'Hecho con detalle', description: 'Diseño pensado para sentirse especial desde el primer vistazo.', icon: 'crown' },
];

async function seed() {
    const { app } = await bootstrapWorker(config);
    let ctx = await getSuperadminContext(app);

    const channelService = app.get(ChannelService);
    const facetService = app.get(FacetService);
    const collectionService = app.get(CollectionService);
    const productService = app.get(ProductService);
    const productOptionGroupService = app.get(ProductOptionGroupService);
    const productOptionService = app.get(ProductOptionService);
    const productVariantService = app.get(ProductVariantService);
    const facetValueService = app.get(FacetValueService);
    const assetImporter = app.get(AssetImporter);

    Logger.info('Configuring default channel for Colombia (COP, es)…', loggerCtx);
    await app.get(GlobalSettingsService).updateSettings(ctx, {
        availableLanguages: [LanguageCode.en, LanguageCode.es],
    });
    const channelUpdateResult = await channelService.update(ctx, {
        id: ctx.channel.id,
        defaultCurrencyCode: CurrencyCode.COP,
        availableCurrencyCodes: [CurrencyCode.COP],
        defaultLanguageCode: LanguageCode.es,
        availableLanguageCodes: [LanguageCode.es],
    });
    if ('errorCode' in channelUpdateResult) {
        throw new Error(`No se pudo actualizar el canal: ${JSON.stringify(channelUpdateResult)}`);
    }
    // RequestContext snapshots the channel (currency, language) at creation time, so everything
    // created below must use a fresh context — otherwise variant prices are saved in whatever
    // currency was active when `ctx` was first built (USD), not the COP we just switched to.
    ctx = await getSuperadminContext(app);

    const assetService = app.get(AssetService);
    await wipeSampleData(ctx, { productService, collectionService, facetService, assetService });

    // FacetService.create() only persists the Facet itself — despite CreateFacetInput having a
    // `values` field, that field is handled by the GraphQL resolver layer, not the service. Since
    // this script calls services directly, each FacetValue has to be created explicitly via
    // FacetValueService.create() right after.
    Logger.info('Creating facets…', loggerCtx);
    const categoryFacet = await facetService.create(ctx, {
        code: 'category',
        isPrivate: false,
        translations: [{ languageCode: LanguageCode.es, name: 'Categoría' }],
    });
    const categoryFacetValueIds = new Map<CategorySlug, string | number>();
    for (const slug of CATEGORY_SLUGS) {
        const value = await facetValueService.create(ctx, categoryFacet, {
            code: slug,
            translations: [{ languageCode: LanguageCode.es, name: categories[slug].name }],
        });
        categoryFacetValueIds.set(slug, value.id);
    }

    const themeFacet = await facetService.create(ctx, {
        code: 'theme',
        isPrivate: false,
        translations: [{ languageCode: LanguageCode.es, name: 'Colección' }],
    });
    const themeFacetValueIds = new Map<ThemeSlug, string | number>();
    for (const slug of THEME_SLUGS) {
        const value = await facetValueService.create(ctx, themeFacet, {
            code: slug,
            translations: [{ languageCode: LanguageCode.es, name: themes[slug].title }],
        });
        themeFacetValueIds.set(slug, value.id);
    }

    const petTypeFacet = await facetService.create(ctx, {
        code: 'pet-type',
        isPrivate: false,
        translations: [{ languageCode: LanguageCode.es, name: 'Tipo de mascota' }],
    });
    const petTypeFacetValueIds = new Map<'dogs' | 'cats', string | number>();
    for (const [code, name] of [
        ['dogs', 'Perros'],
        ['cats', 'Gatos'],
    ] as const) {
        const value = await facetValueService.create(ctx, petTypeFacet, {
            code,
            translations: [{ languageCode: LanguageCode.es, name }],
        });
        petTypeFacetValueIds.set(code, value.id);
    }

    const categoryFacetValueId = (slug: CategorySlug) => categoryFacetValueIds.get(slug)!;
    const themeFacetValueId = (slug: ThemeSlug) => themeFacetValueIds.get(slug)!;
    const petTypeFacetValueId = (petType: 'dogs' | 'cats') => petTypeFacetValueIds.get(petType)!;

    Logger.info('Creating shared option groups (Talla, Color)…', loggerCtx);
    const sizeGroup = await productOptionGroupService.create(ctx, {
        code: 'size',
        translations: [{ languageCode: LanguageCode.es, name: 'Talla' }],
    });
    const sizeOptionIds = new Map<string, string | number>();
    for (const size of SIZES) {
        const option = await productOptionService.create(ctx, sizeGroup.id, {
            code: size.toLowerCase(),
            translations: [{ languageCode: LanguageCode.es, name: size }],
        });
        sizeOptionIds.set(size.toLowerCase(), option.id);
    }

    const colorGroup = await productOptionGroupService.create(ctx, {
        code: 'color',
        translations: [{ languageCode: LanguageCode.es, name: 'Color' }],
    });
    const allColors = dedupeColors(products.flatMap(p => p.colors));
    const colorOptionIds = new Map<string, string | number>();
    for (const color of allColors) {
        const option = await productOptionService.create(ctx, colorGroup.id, {
            code: slugify(color.name),
            translations: [{ languageCode: LanguageCode.es, name: color.name }],
            customFields: { hex: color.hex },
        });
        colorOptionIds.set(slugify(color.name), option.id);
    }
    const sizeOptionId = (size: string) => sizeOptionIds.get(size.toLowerCase())!;
    const colorOptionId = (colorName: string) => colorOptionIds.get(slugify(colorName))!;

    Logger.info('Creating collections (7 categorías + 5 colecciones temáticas)…', loggerCtx);
    // Collection membership is computed asynchronously by the worker's "apply-collection-filters"
    // job, keyed off whichever products/facetValues exist *at the time the job runs*. Creating the
    // collection before its matching products exist yet (as we do here) is fine in principle, but
    // in practice the incremental jobs triggered while products are still being created can lose a
    // race — so every created collection id is tracked here and its filters are re-applied once
    // more at the very end, after the full catalog exists, to force one final, complete recompute.
    const createdCollections: Array<{ id: string | number; filters: ReturnType<typeof facetValueFilter> }> = [];
    for (const slug of CATEGORY_SLUGS) {
        const category = categories[slug];
        const { assets } = await assetImporter.getAssets([category.image], ctx);
        const filters = facetValueFilter([categoryFacetValueId(slug)]);
        const collection = await collectionService.create(ctx, {
            translations: [
                {
                    languageCode: LanguageCode.es,
                    name: category.name,
                    slug,
                    description: category.description,
                    customFields: { tagline: category.tagline },
                },
            ],
            customFields: { icon: category.icon },
            assetIds: assets.map(a => a.id),
            featuredAssetId: assets[0]?.id,
            filters: [filters],
        });
        createdCollections.push({ id: collection.id, filters });
    }
    for (const slug of THEME_SLUGS) {
        const theme = themes[slug];
        const { assets } = await assetImporter.getAssets([theme.image], ctx);
        const filters = facetValueFilter([themeFacetValueId(slug)]);
        const collection = await collectionService.create(ctx, {
            translations: [
                {
                    languageCode: LanguageCode.es,
                    name: theme.title,
                    slug,
                    description: theme.description,
                    customFields: { subtitle: theme.subtitle },
                },
            ],
            assetIds: assets.map(a => a.id),
            featuredAssetId: assets[0]?.id,
            filters: [filters],
        });
        createdCollections.push({ id: collection.id, filters });
    }

    Logger.info(`Creating ${products.length} productos reales de Patilandia…`, loggerCtx);
    for (const product of products) {
        const { assets } = await assetImporter.getAssets(product.images, ctx);
        const facetValueIds = [categoryFacetValueId(product.categorySlug), themeFacetValueId(product.themeSlug)];
        if (product.petType) {
            facetValueIds.push(petTypeFacetValueId(product.petType));
        }

        const created = await productService.create(ctx, {
            translations: [
                {
                    languageCode: LanguageCode.es,
                    name: product.name,
                    slug: product.slug,
                    description: product.description,
                    customFields: { shortDescription: product.shortDescription },
                },
            ],
            facetValueIds,
            featuredAssetId: assets[0]?.id,
            assetIds: assets.map(a => a.id),
            customFields: {
                materials: product.materials,
                care: product.care,
                highlights,
                // Real ratings now come from the patilandia-reviews plugin (it recomputes these
                // two fields whenever a review is approved/rejected/deleted) — seeding a
                // fabricated number here would just get overwritten by the first real review
                // anyway, and would be actively misleading before that happens.
                rating: 0,
                reviewCount: 0,
                badge: product.badge ?? '',
                // All 8 real Patilandia products are featured today (mirrors data/mock-store.ts,
                // where `featured` defaults to true and nothing overrides it) — the field exists
                // so the homepage query has something real to filter on, not a hardcoded slice.
                featured: true,
            },
        });

        await productService.addOptionGroupToProduct(ctx, created.id, sizeGroup.id);
        await productService.addOptionGroupToProduct(ctx, created.id, colorGroup.id);

        await productVariantService.create(
            ctx,
            product.sizes.flatMap(size =>
                product.colors.map(color => ({
                    productId: created.id,
                    sku: `${product.sku}-${size}-${slugify(color.name).toUpperCase()}`,
                    price: product.price * MONEY_FACTOR,
                    stockOnHand: product.stock,
                    optionIds: [sizeOptionId(size), colorOptionId(color.name)],
                    translations: [
                        { languageCode: LanguageCode.es, name: `${product.name} - ${size} / ${color.name}` },
                    ],
                    customFields: {
                        weightKg: product.weightKg,
                        shippingClass: product.shippingClass,
                        compareAtPrice: product.compareAtPrice ? product.compareAtPrice * MONEY_FACTOR : null,
                    },
                })),
            ),
        );

        Logger.info(`  ✔ ${product.name}`, loggerCtx);
    }

    Logger.info('Recalculando membresía de colecciones ahora que existe todo el catálogo…', loggerCtx);
    for (const collection of createdCollections) {
        await collectionService.update(ctx, { id: collection.id, filters: [collection.filters] });
    }

    Logger.info('Seed de Patilandia completo.', loggerCtx);
    await app.close();
    process.exit(0);
}

function facetValueFilter(facetValueIds: Array<string | number>) {
    return {
        code: 'facet-value-filter',
        arguments: [
            { name: 'facetValueIds', value: JSON.stringify(facetValueIds.map(String)) },
            { name: 'containsAny', value: 'false' },
        ],
    };
}

function dedupeColors(colors: SeedColor[]): SeedColor[] {
    const seen = new Map<string, SeedColor>();
    for (const color of colors) {
        seen.set(color.name, color);
    }
    return [...seen.values()];
}

function slugify(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

async function wipeSampleData(
    ctx: RequestContext,
    services: {
        productService: ProductService;
        collectionService: CollectionService;
        facetService: FacetService;
        assetService: AssetService;
    },
) {
    Logger.info('Limpiando catálogo de muestra (dummy data del scaffold)…', loggerCtx);
    const products = await services.productService.findAll(ctx, { take: 500 });
    for (const product of products.items) {
        try {
            await services.productService.softDelete(ctx, product.id);
        } catch (err) {
            Logger.warn(`No se pudo borrar el producto de muestra ${product.id}: ${err}`, loggerCtx);
        }
    }

    // Collections can be nested (sample data ships a tree), and deleting a parent before its
    // children — or vice versa — can throw depending on cascade order, so retry across a few
    // passes rather than fail the whole wipe on the first ordering problem.
    for (let pass = 0; pass < 4; pass++) {
        const collections = await services.collectionService.findAll(ctx, { take: 500 });
        const deletable = collections.items.filter(c => !c.isRoot);
        if (deletable.length === 0) {
            break;
        }
        for (const collection of deletable) {
            try {
                await services.collectionService.delete(ctx, collection.id);
            } catch {
                // Likely still has children this pass — retried on the next one.
            }
        }
    }

    const facets = await services.facetService.findAll(ctx, { take: 500 });
    for (const facet of facets.items) {
        try {
            await services.facetService.delete(ctx, facet.id, true);
        } catch (err) {
            Logger.warn(`No se pudo borrar el facet de muestra ${facet.id}: ${err}`, loggerCtx);
        }
    }

    // Assets aren't cleaned up by product/collection deletion, so without this the script would
    // pile up a duplicate copy of every image on each re-run instead of actually being idempotent.
    const assets = await services.assetService.findAll(ctx, { take: 1000 });
    if (assets.items.length > 0) {
        await services.assetService.delete(
            ctx,
            assets.items.map(a => a.id),
            true,
        );
    }
}

async function getSuperadminContext(app: Awaited<ReturnType<typeof bootstrapWorker>>['app']) {
    const contextService = app.get(RequestContextService);
    return contextService.create({ apiType: 'admin' });
}

if (require.main === module) {
    seed()
        .then(() => process.exit(0))
        .catch(err => {
            Logger.error(err instanceof Error ? (err.stack ?? err.message) : JSON.stringify(err), loggerCtx);
            process.exit(1);
        });
}
