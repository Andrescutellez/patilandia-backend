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
 * Safe to re-run.
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

    const { items } = await shippingMethodService.findAll(ctx, { take: 100 });
    for (const method of items) {
        const rate = RATES[method.code];
        if (rate === undefined) {
            continue;
        }
        await shippingMethodService.update(ctx, {
            id: method.id,
            translations: [
                { languageCode: LanguageCode.en, name: method.name, description: method.description },
            ],
            calculator: {
                code: 'default-shipping-calculator',
                arguments: [
                    { name: 'rate', value: String(rate * MONEY_FACTOR) },
                    { name: 'includesTax', value: 'auto' },
                    { name: 'taxRate', value: '0' },
                ],
            },
        });
        Logger.info(`  ✔ ${method.code} -> $${rate.toLocaleString('es-CO')} COP`, loggerCtx);
    }

    Logger.info('Configurando el 19% de IVA real de Colombia…', loggerCtx);
    const { items: countries } = await countryService.findAll(ctx, { take: 500 });
    const colombia = countries.find(country => country.code === 'CO');
    if (!colombia) {
        throw new Error('No se encontró Colombia entre los países cargados por el scaffold.');
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
    const standardTaxCategory = taxCategories.find(category => category.name === 'Standard Tax');
    if (!standardTaxCategory) {
        throw new Error('No se encontró la categoría "Standard Tax" que trae el scaffold.');
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

    Logger.info('Configurando el método de pago contraentrega…', loggerCtx);
    const { items: paymentMethods } = await paymentMethodService.findAll(ctx, { take: 100 });
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

    Logger.info('Checkout config listo.', loggerCtx);
    await app.close();
}

run()
    .then(() => process.exit(0))
    .catch(err => {
        Logger.error(err instanceof Error ? (err.stack ?? err.message) : JSON.stringify(err), loggerCtx);
        process.exit(1);
    });
