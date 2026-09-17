/**
 * One-off setup for the pieces the checkout flow needs that aren't "catalog" data and so don't
 * belong in seed-patilandia.ts:
 *
 * 1. Realistic COP shipping rates on the shipping methods that @vendure/create's sample data
 *    already ships (standard-shipping/express-shipping, both already eligible for every order
 *    and already assigned to our channel — only their flat `rate` argument was still in the
 *    sample dataset's placeholder currency scale).
 * 2. A real 19% Colombia tax rate. Vendure's DefaultTaxZoneStrategy (the one this project uses)
 *    does NOT look at the order's shipping address at all — `determineTaxZone` just returns
 *    `channel.defaultTaxZone` unconditionally. The scaffold had left that pointed at the sample
 *    data's "Europe" zone (20%, same number "Americas" also happens to use, which is why this
 *    went unnoticed at first). Since every Patilandia order is Colombia, the correct fix is a
 *    dedicated Colombia zone with its own 19% Standard Tax rate, set as the channel default.
 * 3. A "cash-on-delivery" payment method — same dummy-payment-handler as standard-payment (no real
 *    gateway either way, so the underlying handler doesn't need to differ), just a different code
 *    so patilandia-loyalty can tell contraentrega orders apart and defer their PURCHASE points
 *    until delivery is confirmed instead of at PaymentAuthorized (see event-subscribers.ts).
 *
 * Safe to re-run. On a brand-new database, run this BEFORE seed-patilandia.ts — creating priced
 * ProductVariants there requires an active tax zone, which this script is what creates and assigns
 * to the channel (see the note at the top of seed-patilandia.ts for the full explanation).
 *
 *   npx ts-node src/scripts/configure-checkout.ts
 */
import {
    bootstrapWorker,
    ChannelService,
    CountryService,
    LanguageCode,
    Logger,
    PaymentMethodService,
    RequestContextService,
    ShippingMethodService,
    TaxCategoryService,
    TaxRateService,
    ZoneService,
} from '@vendure/core';

import { CASH_ON_DELIVERY_PAYMENT_METHOD_CODE } from '../plugins/patilandia-loyalty/constants';
import { BOLD_PAYMENT_METHOD_CODE } from '../plugins/patilandia-bold/constants';
import { config } from '../vendure-config';

const loggerCtx = 'ConfigureCheckout';
const MONEY_FACTOR = 100;
const COLOMBIA_ZONE_NAME = 'Colombia';
const COLOMBIA_TAX_RATE_PERCENT = 19;

// Realistic flat domestic rates for Colombia, in COP.
const RATES: Record<string, number> = {
    'standard-shipping': 12000,
    'express-shipping': 25000,
};
const SHIPPING_METHOD_NAMES: Record<string, string> = {
    'standard-shipping': 'Standard Shipping',
    'express-shipping': 'Express Shipping',
};

async function run() {
    const { app } = await bootstrapWorker(config);
    const ctx = await app.get(RequestContextService).create({ apiType: 'admin' });
    const shippingMethodService = app.get(ShippingMethodService);
    const paymentMethodService = app.get(PaymentMethodService);
    const zoneService = app.get(ZoneService);
    const taxCategoryService = app.get(TaxCategoryService);
    const taxRateService = app.get(TaxRateService);
    const channelService = app.get(ChannelService);
    const countryService = app.get(CountryService);

    // standard-shipping/express-shipping used to come from @vendure/create's initial-data
    // population too (same story as Colombia/Standard Tax above) — created here if missing,
    // updated in place if they already exist (e.g. re-running this script locally).
    const { items } = await shippingMethodService.findAll(ctx, { take: 100 });
    for (const code of Object.keys(RATES)) {
        const rate = RATES[code];
        const existing = items.find(method => method.code === code);
        const calculator = {
            code: 'default-shipping-calculator',
            arguments: [
                { name: 'rate', value: String(rate * MONEY_FACTOR) },
                { name: 'includesTax', value: 'auto' },
                { name: 'taxRate', value: '0' },
            ],
        };
        if (existing) {
            await shippingMethodService.update(ctx, {
                id: existing.id,
                translations: [
                    { languageCode: LanguageCode.en, name: existing.name, description: existing.description },
                ],
                calculator,
            });
            Logger.info(`  ✔ ${code} -> $${rate.toLocaleString('es-CO')} COP`, loggerCtx);
        } else {
            await shippingMethodService.create(ctx, {
                code,
                fulfillmentHandler: 'manual-fulfillment',
                checker: {
                    code: 'default-shipping-eligibility-checker',
                    arguments: [{ name: 'orderMinimum', value: '0' }],
                },
                calculator,
                translations: [
                    { languageCode: LanguageCode.en, name: SHIPPING_METHOD_NAMES[code] ?? code, description: '' },
                ],
            });
            Logger.info(`  ✔ Método de envío "${code}" creado -> $${rate.toLocaleString('es-CO')} COP`, loggerCtx);
        }
    }

    Logger.info('Configurando el 19% de IVA real de Colombia…', loggerCtx);
    // Both Colombia (as a Country) and the "Standard Tax" category are normally seeded by
    // @vendure/create's one-time initial-data population when a project is first scaffolded — that
    // ran locally weeks ago and its result lives only in the local dev Postgres volume, never in
    // git. A freshly-cloned checkout against a brand-new database (e.g. this VPS) has neither, so
    // both are created here instead of assumed, keeping this script fully self-sufficient.
    const { items: countries } = await countryService.findAll(ctx, { take: 500 });
    let colombia = countries.find(country => country.code === 'CO');
    if (!colombia) {
        colombia = await countryService.create(ctx, {
            code: 'CO',
            enabled: true,
            translations: [{ languageCode: LanguageCode.es, name: 'Colombia' }],
        });
        Logger.info('  ✔ País "Colombia" creado', loggerCtx);
    }

    const { items: zones } = await zoneService.findAll(ctx, { take: 100 });
    let colombiaZone = zones.find(zone => zone.name === COLOMBIA_ZONE_NAME);
    if (!colombiaZone) {
        colombiaZone = await zoneService.create(ctx, {
            name: COLOMBIA_ZONE_NAME,
            memberIds: [colombia.id],
        });
        Logger.info(`  ✔ Zona "${COLOMBIA_ZONE_NAME}" creada`, loggerCtx);
    } else if (!colombiaZone.members?.some(member => member.id === colombia.id)) {
        await zoneService.addMembersToZone(ctx, { zoneId: colombiaZone.id, memberIds: [colombia.id] });
    }

    const { items: taxCategories } = await taxCategoryService.findAll(ctx, { take: 100 });
    let standardTaxCategory = taxCategories.find(category => category.name === 'Standard Tax');
    if (!standardTaxCategory) {
        standardTaxCategory = await taxCategoryService.create(ctx, { name: 'Standard Tax', isDefault: true });
        Logger.info('  ✔ Categoría de impuesto "Standard Tax" creada', loggerCtx);
    }

    const { items: existingRates } = await taxRateService.findAll(ctx, { take: 200 }, ['zone', 'category']);
    const alreadyHasRate = existingRates.some(
        rate => rate.zone.id === colombiaZone!.id && rate.category.id === standardTaxCategory.id,
    );
    if (!alreadyHasRate) {
        await taxRateService.create(ctx, {
            name: 'Standard Tax Colombia',
            enabled: true,
            value: COLOMBIA_TAX_RATE_PERCENT,
            categoryId: standardTaxCategory.id,
            zoneId: colombiaZone.id,
        });
        Logger.info(`  ✔ Tasa "Standard Tax Colombia" creada (${COLOMBIA_TAX_RATE_PERCENT}%)`, loggerCtx);
    }

    if (ctx.channel.defaultTaxZone?.id !== colombiaZone.id) {
        await channelService.update(ctx, { id: ctx.channel.id, defaultTaxZoneId: colombiaZone.id });
        Logger.info(`  ✔ Canal apuntado a "${COLOMBIA_ZONE_NAME}" como zona de impuesto default`, loggerCtx);
    }

    Logger.info('Configurando los métodos de pago…', loggerCtx);
    const { items: paymentMethods } = await paymentMethodService.findAll(ctx, { take: 100 });

    // standard-payment (the dummy handler the storefront's checkout defaults to) is the third
    // and last piece that used to come from @vendure/create's initial-data population — same gap
    // as everything else above on a database that was never scaffolded by that CLI directly.
    const standardPaymentExists = paymentMethods.some(method => method.code === 'standard-payment');
    if (!standardPaymentExists) {
        await paymentMethodService.create(ctx, {
            code: 'standard-payment',
            enabled: true,
            handler: {
                code: 'dummy-payment-handler',
                arguments: [{ name: 'automaticSettle', value: 'false' }],
            },
            translations: [{ languageCode: LanguageCode.en, name: 'Standard Payment', description: '' }],
        });
        Logger.info('  ✔ Método de pago "standard-payment" creado', loggerCtx);
    }

    const cashOnDeliveryExists = paymentMethods.some(method => method.code === CASH_ON_DELIVERY_PAYMENT_METHOD_CODE);
    if (!cashOnDeliveryExists) {
        await paymentMethodService.create(ctx, {
            code: CASH_ON_DELIVERY_PAYMENT_METHOD_CODE,
            enabled: true,
            handler: {
                code: 'dummy-payment-handler',
                arguments: [{ name: 'automaticSettle', value: 'false' }],
            },
            translations: [
                {
                    languageCode: LanguageCode.es,
                    name: 'Pago contraentrega',
                    description: 'Pagás en efectivo cuando recibís tu pedido.',
                },
            ],
        });
        Logger.info(`  ✔ Método de pago "${CASH_ON_DELIVERY_PAYMENT_METHOD_CODE}" creado`, loggerCtx);
        // No explicit assignPaymentMethodsToChannel call needed — PaymentMethodService.create()
        // already scopes the new entity to ctx.channel, confirmed against the real server (the
        // method showed up as eligible from the Shop API immediately). Calling
        // assignPaymentMethodsToChannel anyway threw `error.forbidden` — its permission check
        // apparently expects a real authenticated admin session, not a bare stand-alone-script
        // RequestContext — so it's skipped as both unnecessary and broken in this context.
    }

    // Bold's PaymentMethod, same as above: dummy-payment-handler is never actually invoked to
    // create the Payment — OrderService.addManualPaymentToOrder does that once Bold confirms the
    // charge (see patilandia-bold's BoldService). This entity only exists so "bold" has a real
    // code/name to show in the Admin UI's order/payment views.
    const boldExists = paymentMethods.some(method => method.code === BOLD_PAYMENT_METHOD_CODE);
    if (!boldExists) {
        await paymentMethodService.create(ctx, {
            code: BOLD_PAYMENT_METHOD_CODE,
            enabled: true,
            handler: {
                code: 'dummy-payment-handler',
                arguments: [{ name: 'automaticSettle', value: 'false' }],
            },
            translations: [
                {
                    languageCode: LanguageCode.es,
                    name: 'Bold',
                    description: 'Tarjeta, PSE o Nequi a través de Bold.',
                },
            ],
        });
        Logger.info(`  ✔ Método de pago "${BOLD_PAYMENT_METHOD_CODE}" creado`, loggerCtx);
    }

    Logger.info('Checkout config listo.', loggerCtx);
    await app.close();
}

run()
    .then(() => process.exit(0))
    .catch(err => {
        Logger.error(err instanceof Error ? (err.stack ?? err.message) : JSON.stringify(err), loggerCtx);
        process.exit(1);
    });
