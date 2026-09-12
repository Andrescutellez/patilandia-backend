import { Customer, DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';

@Entity()
export class LoyaltyAccount extends VendureEntity {
    constructor(input?: DeepPartial<LoyaltyAccount>) {
        super(input);
    }

    @Index({ unique: true })
    @OneToOne(() => Customer, { onDelete: 'CASCADE' })
    @JoinColumn()
    customer: Customer;

    /** Cached running total — the source of truth is the sum of LoyaltyTransaction.amount for
     *  this account, but reading that on every balance check (header, checkout, /cuenta) would be
     *  wasteful. Only ever written inside the same transaction as a LoyaltyTransaction insert. */
    @Column({ default: 0 })
    balance: number;

    @Column({ default: 0 })
    lifetimeEarned: number;

    @Column({ default: 0 })
    lifetimeRedeemed: number;

    /** Number of orders that have reached PaymentAuthorized for this customer — the "at least one
     *  real completed purchase" redemption-eligibility signal. Incremented in the same transaction
     *  as the PURCHASE award, not derived by counting orders on every check. */
    @Column({ default: 0 })
    completedOrderCount: number;

    /** Proof the customer controls this inbox, via patilandia-loyalty's own magic-link flow — not
     *  Vendure's native customer verification, which requires a real password-based User account
     *  (see LoyaltyVerificationToken and Decisiones y Razonamiento for why). Null until verified. */
    @Column({ type: 'timestamp', nullable: true })
    emailVerifiedAt: Date | null;
}
