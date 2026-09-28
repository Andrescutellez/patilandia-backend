import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity } from 'typeorm';

/** 'NONE' never touches the price Mi Paquete quoted. 'PERCENTAGE'/'FIXED' each reduce it by
 *  shippingSubsidyPercentage or shippingSubsidyFixedMinorUnits — mutually exclusive, never both at
 *  once (matches how the user described it: pick one knob, not stack them). Never applied to the
 *  real cost Mi Paquete bills Patilandia for creating the shipment (createSending), only to what
 *  the shopper sees/pays at checkout. */
export type ShippingSubsidyMode = 'NONE' | 'PERCENTAGE' | 'FIXED';

/**
 * Singleton — same pattern as patilandia-loyalty's LoyaltySettings (MipaqueteService.getSettings()
 * always fetches/creates the first row). Holds the admin-facing on/off switch for "envío propio en
 * Bogotá" the user asked for: when enabled, a Bogotá destination gets this flat rate (0 = free)
 * instead of ever calling Mi Paquete; when disabled, Bogotá is quoted through Mi Paquete like any
 * other destination. Also holds the "guía automática" switch: when disabled, checkout quoting
 * against Mi Paquete keeps working exactly as before, but MipaqueteService.createShipmentForOrder
 * skips calling /createSending for every order — the admin creates the real shipment manually
 * (Mi Paquete's own dashboard) and fulfills the order through Vendure's normal manual fulfillment.
 */
@Entity()
export class MipaqueteSettings extends VendureEntity {
    constructor(input?: DeepPartial<MipaqueteSettings>) {
        super(input);
    }

    @Column({ default: false })
    bogotaOwnShippingEnabled: boolean;

    /** Vendure money minor units (e.g. 0 = gratis, 500000 = $5.000 COP). Only read when
     *  bogotaOwnShippingEnabled is true. */
    @Column({ type: 'int', default: 0 })
    bogotaOwnShippingCostMinorUnits: number;

    /** Default true — preserves the current production behaviour (every paid order gets a real
     *  Mi Paquete shipment automatically) until an admin explicitly turns it off. */
    @Column({ default: true })
    automaticGuideEnabled: boolean;

    /** Only applied to real Mi Paquete carrier quotes (shipping/mipaquete-carrier.ts) — Bogotá
     *  propio's price is already a flat rate the admin sets directly above, so a subsidy on top of
     *  it wouldn't mean anything (confirmed with the user: subsidy is Mi Paquete-only). */
    @Column({ default: 'NONE' })
    shippingSubsidyMode: ShippingSubsidyMode;

    /** 0-100. Only read when shippingSubsidyMode is 'PERCENTAGE'. */
    @Column({ type: 'int', default: 0 })
    shippingSubsidyPercentage: number;

    /** Vendure money minor units. Only read when shippingSubsidyMode is 'FIXED'. */
    @Column({ type: 'int', default: 0 })
    shippingSubsidyFixedMinorUnits: number;

    /** "Envío gratis desde $X de subtotal" for real Mi Paquete carriers — compared against
     *  Order.subTotal (pre-tax product total, same basis patilandia-loyalty already uses for its
     *  own thresholds), never against the tax-inclusive total. Wins over shippingSubsidyMode: once
     *  crossed, the carrier price is 0, not a discounted price. */
    @Column({ default: false })
    freeShippingThresholdEnabled: boolean;

    @Column({ type: 'int', default: 0 })
    freeShippingThresholdMinorUnits: number;

    /** Same idea as freeShippingThresholdEnabled/MinorUnits above, but its own independent
     *  threshold for "envío propio Bogotá" — confirmed explicitly with the user ("en bogotá también
     *  pero aparte"): Bogotá's flat rate is usually much cheaper than a real Mi Paquete quote, so it
     *  makes sense for it to need a different (often lower) subtotal to go free. */
    @Column({ default: false })
    bogotaFreeShippingThresholdEnabled: boolean;

    @Column({ type: 'int', default: 0 })
    bogotaFreeShippingThresholdMinorUnits: number;
}
