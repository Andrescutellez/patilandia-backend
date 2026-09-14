import {
    dummyPaymentHandler,
    DefaultJobQueuePlugin,
    DefaultSchedulerPlugin,
    DefaultSearchPlugin,
    VendureConfig,
} from '@vendure/core';
import { defaultEmailHandlers, EmailPlugin, FileBasedTemplateLoader } from '@vendure/email-plugin';
import { AssetServerPlugin, defaultAssetStorageStrategyFactory } from '@vendure/asset-server-plugin';
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import { GraphiqlPlugin } from '@vendure/graphiql-plugin';
import 'dotenv/config';
import path from 'path';
import { PatilandiaAdminPlugin } from './plugins/patilandia-admin/patilandia-admin.plugin';
import { PatilandiaReviewsPlugin } from './plugins/patilandia-reviews/patilandia-reviews.plugin';
import { PatilandiaPetsPlugin } from './plugins/patilandia-pets/patilandia-pets.plugin';
import { PatilandiaQaPlugin } from './plugins/patilandia-qa/patilandia-qa.plugin';
import { PatilandiaWishlistPlugin } from './plugins/patilandia-wishlist/patilandia-wishlist.plugin';
import { loyaltyVerificationHandler } from './plugins/patilandia-loyalty/email/loyalty-verification-handler';
import { PatilandiaLoyaltyPlugin } from './plugins/patilandia-loyalty/patilandia-loyalty.plugin';
import { PersonalizationPriceCalculationStrategy } from './plugins/patilandia-personalization/pricing/personalization-price-calculation-strategy';
import { PatilandiaPersonalizationPlugin } from './plugins/patilandia-personalization/patilandia-personalization.plugin';
import { PatilandiaGiftsPlugin } from './plugins/patilandia-gifts/patilandia-gifts.plugin';
import { subscriptionReminderHandler } from './plugins/patilandia-subscriptions/email/subscription-reminder-handler';
import { PatilandiaSubscriptionsPlugin } from './plugins/patilandia-subscriptions/patilandia-subscriptions.plugin';
import { PatilandiaWhatsappPlugin } from './plugins/patilandia-whatsapp/patilandia-whatsapp.plugin';
import { PatilandiaProcurementPlugin } from './plugins/patilandia-procurement/patilandia-procurement.plugin';

const IS_DEV = process.env.APP_ENV === 'dev';
// PORT wins because hosting platforms inject it into the environment at runtime, and that
// must take precedence over any value baked into the .env file at scaffold time.
const serverPort = +process.env.PORT || +process.env.VENDURE_SERVER_PORT || 3000;
// Whether to trust one hop of reverse proxy (Nginx) for X-Forwarded-* headers. This is about
// network topology, not about IS_DEV — a "dev"-labeled staging deployment sitting behind Nginx
// still needs it, or express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every
// request Nginx proxies through. Only a bare `npm run dev:server` on a laptop, with nothing in
// front of it, should leave TRUST_PROXY unset.
const trustProxy = process.env.TRUST_PROXY ? +process.env.TRUST_PROXY : false;
// Base URL of the storefront, used to build links inside transactional emails (account
// verification, password reset, Patipuntos magic-link). Falls back to the local dev port in
// dev; must be set explicitly in production or these links point nowhere real.
const storefrontUrl = process.env.STOREFRONT_URL ?? (IS_DEV ? 'http://localhost:3001' : undefined);
if (!storefrontUrl) {
    throw new Error('STOREFRONT_URL must be set in production');
}

export const config: VendureConfig = {
    apiOptions: {
        port: serverPort,
        adminApiPath: 'admin-api',
        shopApiPath: 'shop-api',
        trustProxy,
        // Which browser origins may make credentialed requests to the Shop and Admin APIs.
        // In dev any origin is reflected, so a storefront on any port works. In production set
        // CORS_ORIGINS to a comma-separated list of the origins you serve, for example
        // "https://example.com,https://admin.example.com". An unset value blocks all
        // cross-origin browser requests, which is the safe default.
        cors: {
            origin: IS_DEV ? true : (process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) ?? []),
            credentials: true,
        },
        // The following options are useful in development mode,
        // but are best turned off for production for security
        // reasons.
        ...(IS_DEV ? {
            adminApiDebug: true,
            shopApiDebug: true,
        } : {}),
    },
    authOptions: {
        tokenMethod: ['bearer', 'cookie'],
        superadminCredentials: {
            identifier: process.env.SUPERADMIN_USERNAME,
            password: process.env.SUPERADMIN_PASSWORD,
        },
        cookieOptions: {
          secret: process.env.COOKIE_SECRET,
        },
    },
    dbConnectionOptions: {
        type: 'postgres',
        // See the README.md "Migrations" section for an explanation of
        // the `synchronize` and `migrations` options.
        // TODO(fase 2 cierre): volver a `false` y generar una migración real con
        // `npx vendure migrate` una vez que el esquema de customFields esté estable.
        synchronize: true,
        migrations: [path.join(__dirname, './migrations/*.+(js|ts)')],
        logging: false,
        database: process.env.DB_NAME,
        schema: process.env.DB_SCHEMA,
        host: process.env.DB_HOST,
        port: +process.env.DB_PORT,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
    },
    paymentOptions: {
        paymentMethodHandlers: [dummyPaymentHandler],
    },
    // Lets a line's price depend on its own customFields (e.g. a personalization surcharge) —
    // see patilandia-personalization/pricing/personalization-price-calculation-strategy.ts. The
    // strategy itself decides the surcharge from its own config, never from what the client sends.
    orderOptions: {
        orderItemPriceCalculationStrategy: new PersonalizationPriceCalculationStrategy(),
    },
    // Lets the Patilandia seed script (src/scripts/seed-patilandia.ts) reference product/category
    // images by filename only — resolved against the storefront's real asset folder in the
    // sibling `patilandia` repo, so no image needs to be duplicated between the two repos.
    importExportOptions: {
        importAssetsDir: path.join(__dirname, '../../patilandia/public/images/patilandia'),
    },
    // When adding or altering custom field definitions, the database will
    // need to be updated. See the "Migrations" section in README.md.
    //
    // These map the Patilandia-specific product attributes that Medusa used to store in a
    // free-form `metadata` JSON blob onto real, typed Vendure custom fields instead — see
    // the migration plan for the full rationale (category -> Collection, petType -> Facet,
    // size/color -> real ProductVariants, everything else -> typed custom fields).
    customFields: {
        Product: [
            { name: 'shortDescription', type: 'localeString' },
            { name: 'materials', type: 'string', list: true },
            { name: 'care', type: 'string', list: true },
            {
                name: 'highlights',
                type: 'struct',
                list: true,
                fields: [
                    { name: 'title', type: 'string' },
                    { name: 'description', type: 'string' },
                    { name: 'icon', type: 'string' },
                ],
            },
            { name: 'rating', type: 'float' },
            { name: 'reviewCount', type: 'int' },
            { name: 'badge', type: 'string' },
            { name: 'featured', type: 'boolean', defaultValue: false },
            // Admin-only toggle for patilandia-subscriptions — configurable per product, same
            // principle as personalization's per-product enable flag. No per-product frequency
            // config on purpose (the user explicitly didn't want that for this MVP): every
            // repurchasable product shares the same fixed frequency list (see
            // SUBSCRIPTION_FREQUENCIES_DAYS in that plugin's constants.ts).
            { name: 'repurchaseEnabled', type: 'boolean', defaultValue: false },
        ],
        ProductVariant: [
            { name: 'weightKg', type: 'float' },
            {
                name: 'shippingClass',
                type: 'string',
                options: [
                    { value: 'standard' },
                    { value: 'bulky' },
                    { value: 'heavy' },
                    { value: 'custom' },
                ],
            },
            // Nullable: only set when the variant has a "was" price to strike through. Vendure
            // has no native "compare at" price — Medusa's storefront.ts adapter used this too.
            { name: 'compareAtPrice', type: 'int', nullable: true },
        ],
        ProductOption: [{ name: 'hex', type: 'string' }],
        Collection: [
            { name: 'tagline', type: 'localeString' },
            { name: 'subtitle', type: 'localeString' },
            { name: 'icon', type: 'string' },
        ],
        // Denormalized display fields for Patipuntos — written only by patilandia-loyalty's own
        // internal listeners/services, never by a public mutation. loyaltyPointsEarned is set
        // asynchronously (after the order-confirmation transaction commits), so the checkout
        // confirmation screen shows a client-side estimate rather than waiting on this field.
        Order: [
            { name: 'loyaltyPointsEarned', type: 'int', defaultValue: 0 },
            { name: 'loyaltyPointsRedeemed', type: 'int', defaultValue: 0 },
            // Set by the storefront via the native `setOrderCustomFields` Shop API mutation when
            // the shopper toggles "¿Es un regalo?" at checkout — see patilandia-gifts. There's no
            // plugin/entity behind these: Vendure's own customFields mechanism is the whole feature.
            { name: 'isGift', type: 'boolean', defaultValue: false },
            { name: 'giftWrap', type: 'boolean', defaultValue: false },
            { name: 'giftMessage', type: 'text', nullable: true },
            { name: 'giftSenderName', type: 'string', nullable: true },
            { name: 'giftAnonymous', type: 'boolean', defaultValue: false },
        ],
        // A JSON snapshot of what the shopper answered for THIS line's personalization (field
        // label + value, not just an id, so an old order stays readable even if the field is later
        // renamed or removed) — see patilandia-personalization. The surcharge itself isn't stored
        // here: it's just the difference between this line's real unit price and the variant's
        // base price, so there's nothing to keep in sync.
        // subscriptionId ties a specific line to the patilandia-subscriptions "Comprar ahora" that
        // created it — kept at the line level (not on Order) so two different subscriptions' items
        // in the same cart don't clobber each other. Set via the same addItemToOrder customFields
        // argument personalization already uses, no new mutation needed.
        OrderLine: [
            { name: 'personalizationValues', type: 'text', nullable: true },
            { name: 'subscriptionId', type: 'string', nullable: true },
        ],
        // Vendure has no native "barrio"/delivery-notes fields — these travel automatically
        // through `setOrderShippingAddress` once declared here, same mechanism as everything
        // else in this customFields block. Used for the gift recipient's address (see
        // patilandia-gifts) but also available for a buyer's own address if useful later.
        Address: [
            { name: 'neighborhood', type: 'string', nullable: true },
            { name: 'deliveryNotes', type: 'text', nullable: true },
        ],
    },
    plugins: [
        GraphiqlPlugin.init(),
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir: path.join(__dirname, '../static/assets'),
            // For local dev, the correct value for assetUrlPrefix should
            // be guessed correctly, but for production it will usually need
            // to be set manually to match your production url.
            assetUrlPrefix: IS_DEV ? undefined : 'https://www.my-shop.com/assets/',
            // LocalAssetStorageStrategy builds each asset's public identifier with Node's
            // platform `path.join`, which emits backslashes on Windows (e.g.
            // "assets/preview\aa\file.png") — invalid in a URL and broken in any browser.
            // Wrapping the default factory to normalize the identifier to forward slashes
            // is the standard workaround for developing/hosting Vendure on Windows.
            storageStrategyFactory: options => {
                const strategy = defaultAssetStorageStrategyFactory(options);
                const toAbsoluteUrl = strategy.toAbsoluteUrl?.bind(strategy);
                if (toAbsoluteUrl) {
                    strategy.toAbsoluteUrl = (request, identifier) =>
                        toAbsoluteUrl(request, identifier.replace(/\\/g, '/'));
                }
                return strategy;
            },
        }),
        DefaultSchedulerPlugin.init(),
        DefaultJobQueuePlugin.init({ useDatabaseForBuffer: true }),
        DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
        EmailPlugin.init({
            devMode: true,
            outputPath: path.join(__dirname, '../static/email/test-emails'),
            route: 'mailbox',
            handlers: [...defaultEmailHandlers, loyaltyVerificationHandler, subscriptionReminderHandler],
            templateLoader: new FileBasedTemplateLoader(path.join(__dirname, '../static/email/templates')),
            globalTemplateVars: {
                fromAddress: '"example" <noreply@example.com>',
                verifyEmailAddressUrl: `${storefrontUrl}/cuenta/verificar`,
                passwordResetUrl: `${storefrontUrl}/cuenta/restablecer-contrasena`,
                // No storefront page exists for this yet — email-change UI is out of scope for
                // the initial real-accounts rollout. The link is correct, just leads nowhere until
                // that page is built.
                changeEmailAddressUrl: `${storefrontUrl}/cuenta/verificar-cambio-correo`,
                // Patipuntos' own magic-link email verification (not the native flow above, which
                // requires a real password-based User account) — points at the real storefront.
                patipuntosVerifyUrl: `${storefrontUrl}/patipuntos/verificar`,
                // patilandia-subscriptions' daily reminder email links here — see
                // subscription-reminder-handler.ts.
                suscripcionesUrl: `${storefrontUrl}/cuenta/suscripciones`
            },
        }),
        DashboardPlugin.init({
            route: 'dashboard',
            appDir: IS_DEV
                ? path.join(__dirname, '../dist/dashboard')
                : path.join(__dirname, 'dashboard'),
        }),
        PatilandiaAdminPlugin.init({}),
        PatilandiaReviewsPlugin.init({}),
        PatilandiaQaPlugin.init({}),
        PatilandiaPetsPlugin.init({}),
        PatilandiaWishlistPlugin.init({}),
        PatilandiaLoyaltyPlugin.init({}),
        PatilandiaPersonalizationPlugin.init({}),
        PatilandiaGiftsPlugin.init({}),
        PatilandiaSubscriptionsPlugin.init({}),
        PatilandiaWhatsappPlugin.init({}),
        PatilandiaProcurementPlugin.init({}),
    ],
};
