import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity } from 'typeorm';

/**
 * Singleton — same pattern as patilandia-loyalty's LoyaltySettings (MipaqueteService.getSettings()
 * always fetches/creates the first row). Holds the admin-facing on/off switch for "envío propio en
 * Bogotá" the user asked for: when enabled, a Bogotá destination gets this flat rate (0 = free)
 * instead of ever calling Mi Paquete; when disabled, Bogotá is quoted through Mi Paquete like any
 * other destination.
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
}
