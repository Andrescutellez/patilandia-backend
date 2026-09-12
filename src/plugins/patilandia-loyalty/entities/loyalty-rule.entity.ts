import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity } from 'typeorm';

export type LoyaltyRuleKind = 'FLAT' | 'PER_CURRENCY_UNIT';

/** e.g. 'PURCHASE', 'SIGNUP', 'FIRST_PURCHASE', 'PET_REGISTERED', 'REVIEW', 'REVIEW_WITH_PHOTO',
 *  'PET_BIRTHDAY'. Not a closed TS union on purpose — new rule codes can be seeded later without
 *  a type change here, same reasoning as LoyaltyTransactionType being a plain string. */
export type LoyaltyRuleCode = string;

/**
 * A configurable earning rule — replaces hardcoded point values so the economy can change from the
 * Dashboard without a deploy ("cambiar 1 punto cada $500 a 1 punto cada $1.000" = editing one row).
 * Seeded once with defaults on plugin bootstrap if the table is empty; admin-editable after that.
 */
@Entity()
export class LoyaltyRule extends VendureEntity {
    constructor(input?: DeepPartial<LoyaltyRule>) {
        super(input);
    }

    @Column({ unique: true })
    code: LoyaltyRuleCode;

    @Column()
    label: string;

    @Column({ default: true })
    enabled: boolean;

    @Column()
    kind: LoyaltyRuleKind;

    /** Used when kind = 'FLAT' — a fixed number of points per occurrence. */
    @Column({ type: 'int', nullable: true })
    points: number | null;

    /** Used when kind = 'PER_CURRENCY_UNIT' — points = floor(baseAmountMinorUnits / this), e.g.
     *  50000 (= $500 COP in minor units) for "1 point per $500 COP". Named explicitly in minor
     *  units so nobody mistakes this for a raw-peso value the way VENDURE_MONEY_FACTOR elsewhere
     *  in this project already warns about. */
    @Column({ type: 'int', nullable: true })
    currencyMinorUnitsPerPoint: number | null;

    @Column('text', { default: '' })
    description: string;
}
