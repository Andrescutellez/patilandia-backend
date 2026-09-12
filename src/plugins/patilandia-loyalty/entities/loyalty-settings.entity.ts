import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity } from 'typeorm';

/**
 * Singleton — a single row holding redemption/valuation settings (as opposed to LoyaltyRule, which
 * is a list of earning events). LoyaltyService.getSettings() always fetches/creates the first row;
 * there is no mechanism enforcing "exactly one row" beyond the service never inserting a second one.
 */
@Entity()
export class LoyaltySettings extends VendureEntity {
    constructor(input?: DeepPartial<LoyaltySettings>) {
        super(input);
    }

    /** e.g. 1000 (= $10 COP in minor units) for "1 point = $10 COP". */
    @Column({ type: 'int', default: 1000 })
    pointValueInMinorUnits: number;

    /** Max percentage of Order.subTotal that may be paid with points, e.g. 20. */
    @Column({ type: 'int', default: 20 })
    maxRedemptionPercentage: number;

    /** Prepared, not active — LoyaltyTransaction.expiresAt is always null while this is false, and
     *  nothing sweeps/filters on it yet. */
    @Column({ default: false })
    expirationEnabled: boolean;

    @Column({ type: 'int', nullable: true })
    expirationDays: number | null;
}
