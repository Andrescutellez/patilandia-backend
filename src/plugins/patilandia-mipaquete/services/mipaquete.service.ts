import { Injectable } from '@nestjs/common';
import {
    ChannelService,
    EntityHydrator,
    Fulfillment,
    FulfillmentService,
    Logger,
    Order,
    OrderService,
    ProductVariant,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
    isGraphQlErrorResult,
} from '@vendure/core';
import { createHash } from 'crypto';

import { mapMipaqueteStateToFulfillmentState } from './mipaquete-state-map';

import { BOGOTA_DANE_CODE, COLOMBIA_COUNTRY_CODE, MIPAQUETE_FULFILLMENT_HANDLER_CODE, loggerCtx } from '../constants';
import { MipaqueteQuoteCache } from '../entities/mipaquete-quote-cache.entity';
import { MipaqueteSettings } from '../entities/mipaquete-settings.entity';
import { MipaqueteShipment } from '../entities/mipaquete-shipment.entity';
import { packOrderLines, type PackableLine, type PackedParcel } from './packing';
import { MipaqueteApiError, MipaqueteClient, MipaqueteNotConfiguredError, type QuoteShippingOption } from './mipaquete-client';

/** Same "channel default sender" origin the Order's own weight/dimensions data lives at — the
 *  admin's own registered pickup address/city (see MIPAQUETE_ORIGIN_LOCATION_CODE below) is what
 *  every quote/shipment originates from, never the customer's address. */
const originLocationCode = process.env.MIPAQUETE_ORIGIN_LOCATION_CODE;

/** Lowercase + strip diacritics, so "medellin"/"MEDELLIN" matches "MEDELLÍN" and "bogota" matches
 *  "BOGOTÁ D.C.". */
function normalizeForSearch(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

function requireOriginLocationCode(): string {
    if (!originLocationCode) {
        throw new Error('MIPAQUETE_ORIGIN_LOCATION_CODE debe estar configurada (código DANE de la ciudad de despacho)');
    }
    return originLocationCode;
}

@Injectable()
export class MipaqueteService {
    constructor(
        private connection: TransactionalConnection,
        private client: MipaqueteClient,
        private entityHydrator: EntityHydrator,
        private orderService: OrderService,
        private fulfillmentService: FulfillmentService,
        private channelService: ChannelService,
        private requestContextService: RequestContextService,
    ) {}

    /** Used by the raw Express webhook handlers, which have no GraphQL RequestContext of their own
     *  — same pattern as patilandia-bold's BoldService.createSystemContext(). */
    async createSystemContext(): Promise<RequestContext> {
        const defaultChannel = await this.channelService.getDefaultChannel();
        return this.requestContextService.create({ apiType: 'admin', channelOrToken: defaultChannel });
    }

    // ---------------------------------------------------------------------------------------
    // Settings (Bogotá toggle)
    // ---------------------------------------------------------------------------------------

    async getSettings(ctx: RequestContext): Promise<MipaqueteSettings> {
        const [existing] = await this.connection.getRepository(ctx, MipaqueteSettings).find({ take: 1 });
        if (existing) return existing;
        return this.connection.getRepository(ctx, MipaqueteSettings).save(new MipaqueteSettings());
    }

    async updateSettings(
        ctx: RequestContext,
        input: Partial<Pick<MipaqueteSettings, 'bogotaOwnShippingEnabled' | 'bogotaOwnShippingCostMinorUnits'>>,
    ): Promise<MipaqueteSettings> {
        const settings = await this.getSettings(ctx);
        Object.assign(settings, input);
        return this.connection.getRepository(ctx, MipaqueteSettings).save(settings);
    }

    /** True only when the admin turned the toggle on AND the order is genuinely headed to Bogotá —
     *  when true, the mipaquete-carrier checkers skip calling the real API entirely (see
     *  shipping/mipaquete-carrier-checker.ts), exactly as the user asked ("que no salga mipaquete si
     *  no envío propio"). */
    async isBogotaOwnShippingEligible(ctx: RequestContext, order: Order): Promise<boolean> {
        const settings = await this.getSettings(ctx);
        if (!settings.bogotaOwnShippingEnabled) return false;
        const locationCode = order.shippingAddress?.customFields?.locationCode;
        return locationCode === BOGOTA_DANE_CODE;
    }

    // ---------------------------------------------------------------------------------------
    // Locations (checkout city picker)
    // ---------------------------------------------------------------------------------------

    /** Backs the checkout's city autocomplete — filters the (internally cached) full /getLocations
     *  list by name, so the storefront never needs its own copy of Colombia's municipalities. Never
     *  throws: an unconfigured/unreachable Mi Paquete just yields no results, same "don't invent
     *  data" rule as the quote itself. Accent/case-insensitive (NFD strip) since a shopper typing
     *  "medellin"/"MEDELLIN" without the tilde must still match "MEDELLÍN". */
    async searchLocations(search: string): Promise<Array<{ locationCode: string; locationName: string; departmentOrStateName: string }>> {
        const term = normalizeForSearch(search);
        if (term.length < 2) return [];
        try {
            const all = await this.client.getLocations();
            return all
                .filter(loc => normalizeForSearch(loc.locationName).includes(term))
                .slice(0, 20)
                .map(loc => ({
                    locationCode: loc.locationCode,
                    locationName: loc.locationName,
                    departmentOrStateName: loc.departmentOrStateName,
                }));
        } catch (err) {
            Logger.warn(`No se pudo buscar ciudades en Mi Paquete: ${err instanceof Error ? err.message : err}`, loggerCtx);
            return [];
        }
    }

    // ---------------------------------------------------------------------------------------
    // Quoting (checkout)
    // ---------------------------------------------------------------------------------------

    private async packOrder(ctx: RequestContext, order: Order): Promise<PackedParcel> {
        await this.entityHydrator.hydrate(ctx, order, { relations: ['lines.productVariant'] });
        const packable: PackableLine[] = order.lines.map(line => ({
            weightKg: (line.productVariant.customFields as unknown as { weightKg?: number }).weightKg ?? 0,
            length: (line.productVariant.customFields as unknown as { length?: number }).length ?? 0,
            width: (line.productVariant.customFields as unknown as { width?: number }).width ?? 0,
            height: (line.productVariant.customFields as unknown as { height?: number }).height ?? 0,
            quantity: line.quantity,
        }));
        return packOrderLines(packable);
    }

    private requestHashFor(destinyLocationCode: string, parcel: PackedParcel): string {
        return createHash('sha1')
            .update(JSON.stringify({ destinyLocationCode, ...parcel }))
            .digest('hex');
    }

    /**
     * Returns the cached quote if it's still fresh for this exact destination+package, otherwise
     * calls Mi Paquete's real /quoteShipping and caches the result. Returns `null` — never a
     * fallback price — when Mi Paquete isn't configured, the order has no destination DANE code yet,
     * or the API call itself fails; every caller (the shipping checkers) must treat `null` as
     * "nothing eligible", per the explicit "no inventar un precio" rule.
     */
    async getOrRefreshQuote(ctx: RequestContext, order: Order): Promise<QuoteShippingOption[] | null> {
        const destinyLocationCode = order.shippingAddress?.customFields?.locationCode;
        if (!destinyLocationCode) return null;

        let origin: string;
        try {
            origin = requireOriginLocationCode();
        } catch (err) {
            Logger.error(err instanceof Error ? err.message : String(err), loggerCtx);
            return null;
        }

        const parcel = await this.packOrder(ctx, order);
        if (parcel.weightKg <= 0) return null;
        const requestHash = this.requestHashFor(destinyLocationCode, parcel);

        const cacheRepo = this.connection.getRepository(ctx, MipaqueteQuoteCache);
        const cached = await cacheRepo.findOne({ where: { order: { id: order.id } }, relations: ['order'] });
        if (cached && cached.requestHash === requestHash) {
            return cached.quote as QuoteShippingOption[];
        }

        try {
            const declaredValue = Math.max(1, Math.round(order.subTotal / 100));
            const quote = await this.client.quoteShipping({
                originLocationCode: origin,
                destinyLocationCode,
                originCountryCode: COLOMBIA_COUNTRY_CODE,
                destinyCountryCode: COLOMBIA_COUNTRY_CODE,
                height: parcel.height,
                width: parcel.width,
                length: parcel.length,
                weight: parcel.weightKg,
                quantity: 1,
                declaredValue,
                saleValue: declaredValue,
            } as never);

            if (cached) {
                cached.requestHash = requestHash;
                cached.quote = quote;
                cached.quotedAt = new Date();
                await cacheRepo.save(cached);
            } else {
                await cacheRepo.save(new MipaqueteQuoteCache({ order, requestHash, quote, quotedAt: new Date() }));
            }
            return quote;
        } catch (err) {
            if (err instanceof MipaqueteNotConfiguredError) {
                Logger.warn(err.message, loggerCtx);
            } else if (err instanceof MipaqueteApiError) {
                Logger.warn(`No se pudo cotizar con Mi Paquete para el pedido ${order.code}: ${err.message}`, loggerCtx);
            } else {
                Logger.error(`Error inesperado cotizando con Mi Paquete: ${err instanceof Error ? err.message : err}`, loggerCtx);
            }
            return null;
        }
    }

    // ---------------------------------------------------------------------------------------
    // Shipment creation (post-payment)
    // ---------------------------------------------------------------------------------------

    /**
     * Called once per order, right when it's genuinely placed (see event-subscribers.ts for the
     * exact PaymentSettled/PaymentAuthorized-for-COD trigger, reusing src/email/order-timing.ts's
     * isOrderPlacedTransition). Idempotent via MipaqueteShipment.idempotencyKey — a retried event
     * for an order that already has a row here is a safe no-op, never a second real shipment.
     * Never throws: a failure is recorded as a FAILED row and logged, exactly per the "pedido pagado
     * pero error al crear envío" requirement — nothing here should ever break checkout or the
     * event pipeline.
     */
    async createShipmentForOrder(ctx: RequestContext, order: Order): Promise<void> {
        const idempotencyKey = `mipaquete:order:${order.id}`;
        const shipmentRepo = this.connection.getRepository(ctx, MipaqueteShipment);
        const existing = await shipmentRepo.findOne({ where: { idempotencyKey } });
        if (existing) return; // Already attempted — CREATED or FAILED, either way not retried here.

        // shippingAddress is an embedded column on Order, not a lazy relation — already loaded,
        // never a valid EntityHydrator relation path (confirmed against the real server earlier
        // this session while building patilandia-fulfillment-handler.ts).
        await this.entityHydrator.hydrate(ctx, order, {
            relations: ['customer', 'shippingLines.shippingMethod', 'lines.productVariant'],
        });

        const destinyLocationCode = order.shippingAddress?.customFields?.locationCode;
        const shippingMethod = order.shippingLines[0]?.shippingMethod;
        const deliveryCompanyIdArg = shippingMethod?.calculator.args.find(a => a.name === 'deliveryCompanyId')?.value;
        const isBogotaOwnShipping = await this.isBogotaOwnShippingEligible(ctx, order);

        // "Envío propio Bogotá" never touches Mi Paquete's API at all — nothing to create there.
        if (isBogotaOwnShipping || !deliveryCompanyIdArg) {
            return;
        }

        if (!destinyLocationCode || !order.customer) {
            await shipmentRepo.save(
                new MipaqueteShipment({
                    order,
                    idempotencyKey,
                    state: 'FAILED',
                    shippingCostMinorUnits: order.shippingWithTax,
                    packageWeightKg: 0,
                    packageLength: 0,
                    packageWidth: 0,
                    packageHeight: 0,
                    lastError: 'Falta el código DANE de destino o el cliente del pedido — no se pudo crear el envío.',
                }),
            );
            return;
        }

        const parcel = await this.packOrder(ctx, order);

        try {
            const origin = requireOriginLocationCode();
            const address = order.shippingAddress;
            const [firstName, ...rest] = (address.fullName || order.customer.firstName || 'Cliente').trim().split(/\s+/);
            const created = await this.client.createSending({
                sender: {
                    name: process.env.MIPAQUETE_SENDER_NAME ?? 'Patilandia',
                    surname: '',
                    cellPhone: process.env.MIPAQUETE_SENDER_PHONE ?? '',
                    prefix: '+57',
                    email: process.env.MIPAQUETE_SENDER_EMAIL ?? '',
                    pickupAddress: process.env.MIPAQUETE_SENDER_ADDRESS ?? '',
                    nit: process.env.MIPAQUETE_SENDER_NIT ?? '',
                    nitType: 'NIT',
                },
                receiver: {
                    name: firstName || 'Cliente',
                    surname: rest.join(' '),
                    email: order.customer.emailAddress,
                    prefix: '+57',
                    cellPhone: address.phoneNumber || '',
                    destinationAddress: address.streetLine1 ?? '',
                },
                productInformation: {
                    quantity: 1,
                    width: parcel.width,
                    large: parcel.length,
                    height: parcel.height,
                    weight: parcel.weightKg,
                    forbiddenProduct: true,
                    productReference: order.code,
                    declaredValue: Math.max(1, Math.round(order.subTotal / 100)),
                },
                locate: { originDaneCode: origin, destinyDaneCode: destinyLocationCode },
                channel: 'Patilandia',
                deliveryCompany: String(deliveryCompanyIdArg),
                description: `Pedido Patilandia #${order.code}`,
                paymentType: 101,
                valueCollection: 0,
                requestPickup: false,
                adminTransactionData: { saleValue: 0 },
            });

            const fulfillmentResult = await this.orderService.createFulfillment(ctx, {
                lines: order.lines.map(line => ({ orderLineId: line.id, quantity: line.quantity })),
                handler: {
                    code: MIPAQUETE_FULFILLMENT_HANDLER_CODE,
                    arguments: [
                        { name: 'method', value: shippingMethod?.name ?? 'Mi Paquete' },
                        { name: 'mpCode', value: String(created.mpCode) },
                    ],
                },
            });
            const fulfillmentId = !isGraphQlErrorResult(fulfillmentResult) ? String(fulfillmentResult.id) : null;
            if (isGraphQlErrorResult(fulfillmentResult)) {
                Logger.error(
                    `Envío creado en Mi Paquete (mpCode ${created.mpCode}) pero no se pudo crear el Fulfillment de Vendure para el pedido ${order.code}: ${fulfillmentResult.message}`,
                    loggerCtx,
                );
            }

            await shipmentRepo.save(
                new MipaqueteShipment({
                    order,
                    idempotencyKey,
                    state: 'CREATED',
                    mpCode: created.mpCode,
                    deliveryCompanyId: String(deliveryCompanyIdArg),
                    deliveryCompanyName: shippingMethod?.name ?? null,
                    shippingCostMinorUnits: order.shippingWithTax,
                    packageWeightKg: parcel.weightKg,
                    packageLength: parcel.length,
                    packageWidth: parcel.width,
                    packageHeight: parcel.height,
                    fulfillmentId,
                }),
            );
            Logger.info(`Envío creado en Mi Paquete para el pedido ${order.code} — mpCode ${created.mpCode}`, loggerCtx);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            Logger.error(`No se pudo crear el envío en Mi Paquete para el pedido ${order.code}: ${message}`, loggerCtx);
            await shipmentRepo.save(
                new MipaqueteShipment({
                    order,
                    idempotencyKey,
                    state: 'FAILED',
                    shippingCostMinorUnits: order.shippingWithTax,
                    packageWeightKg: parcel.weightKg,
                    packageLength: parcel.length,
                    packageWidth: parcel.width,
                    packageHeight: parcel.height,
                    lastError: message,
                }),
            );
        }
    }

    // ---------------------------------------------------------------------------------------
    // Webhooks
    // ---------------------------------------------------------------------------------------

    /** Applies the `urlForGuides` webhook (mipaquete-api-v2.md section 6.3) — updates the
     *  MipaqueteShipment row AND the linked Fulfillment directly (no native "update fulfillment"
     *  mutation exists in Vendure). Naturally idempotent: re-applying the same guide data twice just
     *  writes the same values again, no duplicate side effect. */
    async applyGuideWebhook(
        mpCode: number,
        guide: { trackingCode: string | null; pdfGuideUrls: string[] | null; pickupCode: string | null },
    ): Promise<void> {
        const ctx = await this.createSystemContext();
        const shipmentRepo = this.connection.getRepository(ctx, MipaqueteShipment);
        const shipment = await shipmentRepo.findOne({ where: { mpCode } });
        if (!shipment) {
            Logger.warn(`Webhook de guía de Mi Paquete: no se encontró ningún envío con mpCode ${mpCode}`, loggerCtx);
            return;
        }

        shipment.trackingCode = guide.trackingCode;
        shipment.pdfGuideUrls = guide.pdfGuideUrls;
        shipment.pickupCode = guide.pickupCode;
        await shipmentRepo.save(shipment);

        if (!shipment.fulfillmentId) return;
        const fulfillmentRepo = this.connection.getRepository(ctx, Fulfillment);
        const fulfillment = await fulfillmentRepo.findOne({ where: { id: shipment.fulfillmentId } });
        if (!fulfillment) return;
        fulfillment.trackingCode = guide.trackingCode ?? '';
        fulfillment.customFields.trackingUrl = guide.pdfGuideUrls?.[0] ?? null;
        await fulfillmentRepo.save(fulfillment);
    }

    /** Applies the `urlForStates` webhook (section 6.4) — Mi Paquete's own state strings are free
     *  text (no official catalog, per the doc's section 7), so mapMipaqueteStateToFulfillmentState
     *  only acts on the ones that clearly mean shipped/delivered/cancelled and logs anything else
     *  without failing. Idempotent via Vendure's own Fulfillment state machine: transitioning into
     *  the state it's already in is rejected as a no-op, caught and ignored here rather than logged
     *  as an error. */
    async applyStateWebhook(mpCode: number, mipaqueteState: string): Promise<void> {
        const target = mapMipaqueteStateToFulfillmentState(mipaqueteState);
        if (!target) {
            Logger.info(`Webhook de estado de Mi Paquete "${mipaqueteState}" (mpCode ${mpCode}) — sin transición asociada`, loggerCtx);
            return;
        }

        const ctx = await this.createSystemContext();
        const shipment = await this.connection.getRepository(ctx, MipaqueteShipment).findOne({ where: { mpCode } });
        if (!shipment?.fulfillmentId) {
            Logger.warn(`Webhook de estado de Mi Paquete: no se encontró envío/fulfillment para mpCode ${mpCode}`, loggerCtx);
            return;
        }

        const result = await this.fulfillmentService.transitionToState(ctx, shipment.fulfillmentId, target);
        if (isGraphQlErrorResult(result)) {
            // Most commonly "already in this state" (a re-sent webhook) or a state the Fulfillment
            // can't reach directly from where it is — neither is worth failing the webhook over.
            Logger.info(`Transición de Fulfillment a "${target}" no aplicada para mpCode ${mpCode}: ${result.message}`, loggerCtx);
        }
    }

    // ---------------------------------------------------------------------------------------
    // Admin visibility
    // ---------------------------------------------------------------------------------------

    listShipments(ctx: RequestContext): Promise<MipaqueteShipment[]> {
        return this.connection
            .getRepository(ctx, MipaqueteShipment)
            .find({ relations: ['order'], order: { createdAt: 'DESC' }, take: 200 });
    }

    /** Variants still sitting on the placeholder default (10cm/10cm/10cm) for at least one of the
     *  three dimensions — see vendure-config.ts's ProductVariant.length/width/height defaultValue.
     *  A raw query rather than the generic admin list-filter DSL, matching the same "just query
     *  directly" pattern LoyaltyService.listAllTransactions already uses for a similar "give me
     *  everything, for support/audits" admin need. */
    async findVariantsWithIncompleteShippingData(ctx: RequestContext): Promise<ProductVariant[]> {
        return this.connection
            .getRepository(ctx, ProductVariant)
            .createQueryBuilder('variant')
            .leftJoinAndSelect('variant.translations', 'translations')
            .leftJoinAndSelect('variant.product', 'product')
            .leftJoinAndSelect('product.translations', 'productTranslations')
            .where('variant.deletedAt IS NULL')
            .andWhere(
                "(variant.customFields->>'length' = '10' OR variant.customFields->>'width' = '10' OR variant.customFields->>'height' = '10' OR variant.customFields->>'weightKg' IS NULL OR variant.customFields->>'weightKg' = '0')",
            )
            .getMany();
    }
}
