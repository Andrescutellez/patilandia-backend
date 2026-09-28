import {
    dummyPaymentHandler,
    defaultShippingCalculator,
    defaultShippingEligibilityChecker,
    DefaultJobQueuePlugin,
    DefaultSchedulerPlugin,
    DefaultSearchPlugin,
    LanguageCode,
    VendureConfig,
} from '@vendure/core';
import { EmailPlugin, FileBasedTemplateLoader } from '@vendure/email-plugin';
import type { EmailPluginOptions, EmailPluginDevModeOptions } from '@vendure/email-plugin';
import { AssetServerPlugin, defaultAssetStorageStrategyFactory } from '@vendure/asset-server-plugin';
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import { GraphiqlPlugin } from '@vendure/graphiql-plugin';
import 'dotenv/config';
import path from 'path';
import {
    emailAddressChangeHandler,
    emailVerificationHandler,
    orderConfirmationHandler,
    passwordResetHandler,
} from './email/native-handlers';
import { giftOrderConfirmationHandler } from './email/handlers/gift-order-confirmation-handler';
import { orderStateChangeHandler } from './email/handlers/order-state-change-handler';
import { newOrderAdminNotificationHandler } from './email/handlers/new-order-admin-notification-handler';
import { codOrderConfirmationHandler } from './email/handlers/cod-order-confirmation-handler';
import { EMAIL_ASSET_BASE_URL } from './email/senders';
import { PatilandiaAdminPlugin } from './plugins/patilandia-admin/patilandia-admin.plugin';
import { PatilandiaReviewsPlugin } from './plugins/patilandia-reviews/patilandia-reviews.plugin';
import { PatilandiaPetsPlugin } from './plugins/patilandia-pets/patilandia-pets.plugin';
import { PatilandiaQaPlugin } from './plugins/patilandia-qa/patilandia-qa.plugin';
import { PatilandiaWishlistPlugin } from './plugins/patilandia-wishlist/patilandia-wishlist.plugin';
import { loyaltyVerificationHandler } from './plugins/patilandia-loyalty/email/loyalty-verification-handler';
import { loyaltyPointsEarnedHandler } from './plugins/patilandia-loyalty/email/loyalty-points-earned-handler';
import { PatilandiaLoyaltyPlugin } from './plugins/patilandia-loyalty/patilandia-loyalty.plugin';
import { PersonalizationPriceCalculationStrategy } from './plugins/patilandia-personalization/pricing/personalization-price-calculation-strategy';
import { PatilandiaPersonalizationPlugin } from './plugins/patilandia-personalization/patilandia-personalization.plugin';
import { PatilandiaGiftsPlugin } from './plugins/patilandia-gifts/patilandia-gifts.plugin';
import { subscriptionReminderHandler } from './plugins/patilandia-subscriptions/email/subscription-reminder-handler';
import { subscriptionCreatedHandler } from './plugins/patilandia-subscriptions/email/subscription-created-handler';
import { PatilandiaSubscriptionsPlugin } from './plugins/patilandia-subscriptions/patilandia-subscriptions.plugin';
import { petRegisteredHandler } from './plugins/patilandia-pets/email/pet-registered-handler';
import { productQuestionAnsweredHandler } from './plugins/patilandia-qa/email/product-question-answered-handler';
import { reviewApprovedHandler } from './plugins/patilandia-reviews/email/review-approved-handler';
import { PatilandiaWhatsappPlugin } from './plugins/patilandia-whatsapp/patilandia-whatsapp.plugin';
import { PatilandiaProcurementPlugin } from './plugins/patilandia-procurement/patilandia-procurement.plugin';
import { PatilandiaBoldPlugin } from './plugins/patilandia-bold/patilandia-bold.plugin';
import { patilandiaFulfillmentHandler } from './config/patilandia-fulfillment-handler';
import { PatilandiaMipaquetePlugin } from './plugins/patilandia-mipaquete/patilandia-mipaquete.plugin';
import { mipaqueteBogotaChecker, mipaqueteBogotaCalculator } from './plugins/patilandia-mipaquete/shipping/mipaquete-bogota';
import { mipaqueteCarrierChecker, mipaqueteCarrierCalculator } from './plugins/patilandia-mipaquete/shipping/mipaquete-carrier';
import { mipaqueteFulfillmentHandler } from './plugins/patilandia-mipaquete/shipping/mipaquete-fulfillment-handler';

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
// Bold (pasarela de pago real, Colombia) — ambas llaves son de sandbox mientras se prueba la
// integración. BOLD_SANDBOX controla cómo se firma el webhook (Bold usa un string vacío como
// llave del HMAC en sandbox, no la llave secreta real — ver bold.service.ts).
const boldIdentityKey = process.env.BOLD_IDENTITY_KEY;
const boldSecretKey = process.env.BOLD_SECRET_KEY;
if (!boldIdentityKey || !boldSecretKey) {
    throw new Error('BOLD_IDENTITY_KEY y BOLD_SECRET_KEY deben estar configuradas');
}
const boldSandbox = process.env.BOLD_SANDBOX !== 'false';
// Real SMTP (Purelymail) is opt-in via SMTP_HOST's presence, deliberately NOT tied to IS_DEV — the
// staging VPS still runs with APP_ENV=dev (its production-hardening flag, unrelated to email) and
// still needs to send real mail. Without SMTP_HOST, EmailPlugin falls back to devMode (writes to
// disk, served at /mailbox) so `npm run dev:server` keeps working with zero email setup.
const smtpHost = process.env.SMTP_HOST;
const smtpPort = smtpHost ? Number(process.env.SMTP_PORT) : undefined;
const smtpUser = process.env.SMTP_USER;
const smtpPassword = process.env.SMTP_PASSWORD;
// Purelymail's port 465 is implicit TLS (secure:true), not STARTTLS-on-587 — defaults to true like
// BOLD_SANDBOX's `!== 'false'` pattern, so it only needs setting explicitly to opt OUT.
const smtpSecure = process.env.SMTP_SECURE !== 'false';
if (smtpHost && (!smtpPort || !smtpUser || !smtpPassword)) {
    // Never interpolate smtpPassword itself into this message — only ever report which vars are
    // missing, never their values.
    throw new Error('SMTP_HOST está configurado: SMTP_PORT, SMTP_USER y SMTP_PASSWORD también deben estarlo');
}
// One list shared by both the real-SMTP and devMode branches below, so every handler always
// applies regardless of which transport is active. Order confirmation and gift confirmation are
// mutually exclusive per order (see native-handlers.ts's filter on orderConfirmationHandler).
const emailHandlers = [
    orderConfirmationHandler,
    giftOrderConfirmationHandler,
    orderStateChangeHandler,
    codOrderConfirmationHandler,
    newOrderAdminNotificationHandler,
    emailVerificationHandler,
    passwordResetHandler,
    emailAddressChangeHandler,
    loyaltyVerificationHandler,
    subscriptionReminderHandler,
    loyaltyPointsEarnedHandler,
    petRegisteredHandler,
    productQuestionAnsweredHandler,
    subscriptionCreatedHandler,
    reviewApprovedHandler,
];
const emailGlobalTemplateVars = {
    verifyEmailAddressUrl: `${storefrontUrl}/cuenta/verificar`,
    passwordResetUrl: `${storefrontUrl}/cuenta/restablecer-contrasena`,
    // No storefront page exists for this yet — email-change UI is out of scope for the initial
    // real-accounts rollout. The link is correct, just leads nowhere until that page is built.
    changeEmailAddressUrl: `${storefrontUrl}/cuenta/verificar-cambio-correo`,
    // Patipuntos' own magic-link email verification (not the native flow above, which requires a
    // real password-based User account) — points at the real storefront.
    patipuntosVerifyUrl: `${storefrontUrl}/patipuntos/verificar`,
    // patilandia-subscriptions' daily reminder email links here — see subscription-reminder-handler.ts.
    suscripcionesUrl: `${storefrontUrl}/cuenta/suscripciones`,
    storefrontUrl,
    emailAssetBaseUrl: EMAIL_ASSET_BASE_URL,
};

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
    // fulfillmentHandlers: patilandiaFulfillmentHandler replaces the default manualFulfillmentHandler
    // with the same-code version that adds an optional trackingUrl arg (see
    // config/patilandia-fulfillment-handler.ts); mipaqueteFulfillmentHandler is the automated
    // counterpart patilandia-mipaquete creates shipments with (never offered manually).
    // shippingCalculators/shippingEligibilityCheckers: the two pairs patilandia-mipaquete registers —
    // one ShippingMethod per real Mi Paquete carrier uses mipaqueteCarrier*, "Envío propio Bogotá"
    // uses mipaqueteBogota* — see src/scripts/configure-checkout.ts for where those ShippingMethods
    // get created.
    shippingOptions: {
        fulfillmentHandlers: [patilandiaFulfillmentHandler, mipaqueteFulfillmentHandler],
        // Keeps Vendure's own defaults registered too (not removed) — the 2 pre-existing flat-rate
        // ShippingMethods from configure-checkout.ts (standard-shipping/express-shipping) still
        // reference them by code, and old Orders' shippingLines snapshot whichever method they used
        // at the time. configure-checkout.ts disables (not deletes) those 2 methods once the real
        // Mi Paquete ones exist, rather than this config ever breaking their reference.
        shippingEligibilityCheckers: [defaultShippingEligibilityChecker, mipaqueteCarrierChecker, mipaqueteBogotaChecker],
        shippingCalculators: [defaultShippingCalculator, mipaqueteCarrierCalculator, mipaqueteBogotaCalculator],
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
            {
                name: 'shortDescription',
                type: 'localeString',
                label: [{ languageCode: LanguageCode.es, value: 'Descripción corta' }],
                description: [
                    {
                        languageCode: LanguageCode.es,
                        value: 'Frase corta que se muestra en las tarjetas de producto y en las páginas de categoría — distinta de la descripción larga de arriba.',
                    },
                ],
            },
            {
                name: 'materials',
                type: 'string',
                list: true,
                label: [{ languageCode: LanguageCode.es, value: 'Materiales' }],
                description: [
                    {
                        languageCode: LanguageCode.es,
                        value: 'Lista de materiales del producto (ej: "Microfibra premium", "Relleno siliconado") — se muestra en la página de producto.',
                    },
                ],
            },
            {
                name: 'care',
                type: 'string',
                list: true,
                label: [{ languageCode: LanguageCode.es, value: 'Cuidados' }],
                description: [
                    {
                        languageCode: LanguageCode.es,
                        value: 'Instrucciones de cuidado (ej: "Lavar a mano", "No usar blanqueador") — se muestra junto a los materiales.',
                    },
                ],
            },
            {
                name: 'highlights',
                type: 'struct',
                list: true,
                label: [{ languageCode: LanguageCode.es, value: 'Características destacadas' }],
                description: [
                    {
                        languageCode: LanguageCode.es,
                        value: 'Tarjetas cortas con ícono + título + descripción que resaltan diferenciales del producto — se muestran en la página de producto.',
                    },
                ],
                fields: [
                    {
                        name: 'title',
                        type: 'string',
                        label: [{ languageCode: LanguageCode.es, value: 'Título' }],
                    },
                    {
                        name: 'description',
                        type: 'string',
                        label: [{ languageCode: LanguageCode.es, value: 'Descripción' }],
                    },
                    {
                        name: 'icon',
                        type: 'string',
                        label: [{ languageCode: LanguageCode.es, value: 'Ícono' }],
                        description: [
                            {
                                languageCode: LanguageCode.es,
                                value: 'Nombre del ícono a mostrar (ej: "shield", "crown", "truck") — ver los íconos disponibles en icons.tsx del storefront.',
                            },
                        ],
                    },
                ],
            },
            {
                name: 'rating',
                type: 'float',
                label: [{ languageCode: LanguageCode.es, value: 'Calificación promedio' }],
                description: [
                    {
                        languageCode: LanguageCode.es,
                        value: 'Se recalcula solo cuando se aprueba una reseña — normalmente no hace falta tocarlo a mano.',
                    },
                ],
            },
            {
                name: 'reviewCount',
                type: 'int',
                label: [{ languageCode: LanguageCode.es, value: 'Cantidad de reseñas' }],
                description: [
                    {
                        languageCode: LanguageCode.es,
                        value: 'Se recalcula solo con las reseñas aprobadas — normalmente no hace falta tocarlo a mano.',
                    },
                ],
            },
            {
                name: 'badge',
                type: 'string',
                label: [{ languageCode: LanguageCode.es, value: 'Etiqueta (badge)' }],
                description: [
                    {
                        languageCode: LanguageCode.es,
                        value: 'Texto corto sobre la imagen del producto (ej: "Más vendido", "Nuevo") — dejalo vacío si no querés ninguna.',
                    },
                ],
            },
            {
                name: 'featured',
                type: 'boolean',
                defaultValue: false,
                label: [{ languageCode: LanguageCode.es, value: 'Destacado' }],
                description: [
                    {
                        languageCode: LanguageCode.es,
                        value: 'Si está activado, el producto aparece en la sección "Destacados" del home.',
                    },
                ],
            },
            // Admin-only toggle for patilandia-subscriptions — configurable per product, same
            // principle as personalization's per-product enable flag. No per-product frequency
            // config on purpose (the user explicitly didn't want that for this MVP): every
            // repurchasable product shares the same fixed frequency list (see
            // SUBSCRIPTION_FREQUENCIES_DAYS in that plugin's constants.ts).
            {
                name: 'repurchaseEnabled',
                type: 'boolean',
                defaultValue: false,
                label: [{ languageCode: LanguageCode.es, value: 'Permitir suscripción / recompra' }],
                description: [
                    {
                        languageCode: LanguageCode.es,
                        value: 'Si está activado, el cliente puede programar recompras periódicas de este producto desde su cuenta.',
                    },
                ],
            },
        ],
        // weightKg/length/width/height are what patilandia-mipaquete's packing.ts sums/maxes into
        // the single-package quote sent to Mi Paquete (see that plugin's README-style comment at
        // the top of packing.ts) — Mi Paquete requires integers, so these get Math.ceil()'d at the
        // point of use rather than changed to `int` here, to avoid a migration risk for existing
        // rows. length/width/height are new (2026-09-27, no dimension fields existed before this);
        // existing variants get `defaultValue: 10` (a deliberately obvious placeholder, not a real
        // guess) so nothing already published breaks — see patilandia-mipaquete's Dashboard page for
        // the "variantes con datos de envío incompletos" list that flags every variant still sitting
        // on that default so an admin can fill in the real number.
        ProductVariant: [
            {
                name: 'weightKg',
                type: 'float',
                label: [{ languageCode: LanguageCode.es, value: 'Peso (kg)' }],
                description: [
                    {
                        languageCode: LanguageCode.es,
                        value: 'Peso real de esta variante empacada — se usa para cotizar el envío con la transportadora.',
                    },
                ],
            },
            {
                name: 'length',
                type: 'int',
                defaultValue: 10,
                label: [{ languageCode: LanguageCode.es, value: 'Largo (cm)' }],
                description: [
                    { languageCode: LanguageCode.es, value: 'Largo real del empaque de esta variante, en centímetros.' },
                ],
            },
            {
                name: 'width',
                type: 'int',
                defaultValue: 10,
                label: [{ languageCode: LanguageCode.es, value: 'Ancho (cm)' }],
                description: [
                    { languageCode: LanguageCode.es, value: 'Ancho real del empaque de esta variante, en centímetros.' },
                ],
            },
            {
                name: 'height',
                type: 'int',
                defaultValue: 10,
                label: [{ languageCode: LanguageCode.es, value: 'Alto (cm)' }],
                description: [
                    { languageCode: LanguageCode.es, value: 'Alto real del empaque de esta variante, en centímetros.' },
                ],
            },
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
            // The DANE location code Mi Paquete requires to cotizar/crear un envío (ej. "11001000"
            // Bogotá) — set by the storefront's city selector (backed by patilandia-mipaquete's
            // cached /getLocations) via setOrderShippingAddress, same mechanism as neighborhood
            // above. Nullable: an order placed before this existed, or one shipped by hand, never
            // has it — every Mi Paquete read site treats a missing code as "can't quote/create".
            { name: 'locationCode', type: 'string', nullable: true },
        ],
        // Set by patilandia-fulfillment-handler.ts's createFulfillment() from the optional
        // trackingUrl arg the admin fills in the Dashboard's "Fulfill order" dialog — never set
        // directly by any mutation. Read by order-state-change-handler.ts and the storefront's
        // "/pedido/[code]" page; both treat null/empty as "don't show a tracking link".
        Fulfillment: [{ name: 'trackingUrl', type: 'string', nullable: true }],
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
        EmailPlugin.init(
            (smtpHost
                ? {
                      transport: {
                          type: 'smtp',
                          host: smtpHost,
                          port: smtpPort,
                          secure: smtpSecure,
                          auth: { user: smtpUser, pass: smtpPassword },
                      },
                      handlers: emailHandlers,
                      templateLoader: new FileBasedTemplateLoader(path.join(__dirname, '../static/email/templates')),
                      globalTemplateVars: emailGlobalTemplateVars,
                  }
                : {
                      devMode: true,
                      outputPath: path.join(__dirname, '../static/email/test-emails'),
                      route: 'mailbox',
                      handlers: emailHandlers,
                      templateLoader: new FileBasedTemplateLoader(path.join(__dirname, '../static/email/templates')),
                      globalTemplateVars: emailGlobalTemplateVars,
                  }) satisfies EmailPluginOptions | EmailPluginDevModeOptions,
        ),
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
        PatilandiaBoldPlugin.init({
            identityKey: boldIdentityKey,
            secretKey: boldSecretKey,
            sandbox: boldSandbox,
            storefrontUrl,
        }),
        PatilandiaMipaquetePlugin,
    ],
};
