import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { LoyaltyAccount } from './loyalty-account.entity';

/** 'EARN' | 'REDEEM' | 'REVERSAL' | 'EXPIRATION' | 'ADJUSTMENT' — kept as a plain string (app-level
 *  validated) rather than a DB enum, same convention as PetProfile.species/sizeLabel. */
export type LoyaltyTransactionType = 'EARN' | 'REDEEM' | 'REVERSAL' | 'EXPIRATION' | 'ADJUSTMENT';

/**
 * The ledger — append-only, never updated or deleted in normal operation. LoyaltyAccount.balance
 * is a cache; this table is the source of truth and the audit trail the business requires ("poder
 * auditar exactamente cómo se obtuvo y cómo se gastó cada punto").
 */
@Entity()
export class LoyaltyTransaction extends VendureEntity {
    constructor(input?: DeepPartial<LoyaltyTransaction>) {
        super(input);
    }

    @Index()
    @ManyToOne(() => LoyaltyAccount, { onDelete: 'CASCADE' })
    @JoinColumn()
    account: LoyaltyAccount;

    /** Signed: positive for EARN/positive REVERSAL, negative for REDEEM/EXPIRATION/negative REVERSAL. */
    @Column('int')
    amount: number;

    @Column()
    type: LoyaltyTransactionType;

    /** Which LoyaltyRule produced this (e.g. 'PURCHASE', 'SIGNUP') — null for REVERSAL/ADJUSTMENT
     *  rows, which aren't rule-driven. Explicit `type: 'varchar'` — a nullable string column's
     *  reflected TS type (`string | null`) can't be inferred by TypeORM on its own (it reflects as
     *  `Object`, which Postgres rejects). */
    @Column({ type: 'varchar', nullable: true })
    ruleCode: string | null;

    /** e.g. 'Order', 'PetProfile', 'ProductReview' — what real-world thing caused this movement. */
    @Column({ type: 'varchar', nullable: true })
    referenceType: string | null;

    @Column({ type: 'varchar', nullable: true })
    referenceId: string | null;

    /** The anti-duplication mechanism: a deterministic key (e.g. `earn:order:123:PURCHASE`) with a
     *  unique DB index. Awarding logic always tries to INSERT with this key first — a unique-
     *  violation means "already awarded," treated as a no-op rather than a retry. See
     *  LoyaltyService.award() for why the insert must happen before the balance update in the
     *  same transaction, not the other way around. */
    @Index({ unique: true })
    @Column()
    idempotencyKey: string;

    /** Snapshot of LoyaltyAccount.balance immediately after this row — lets the history UI render
     *  a running total without re-summing the ledger on every page. */
    @Column('int')
    balanceAfter: number;

    /** Free-form context: the base amount and rate used for a PURCHASE calculation (so the
     *  reconciliation task can tell what SHOULD have been awarded if the order total later
     *  changes), the multiplier applied, etc. */
    // Typed as `any` rather than Record<string, unknown> — TypeORM's DeepPartial can't distribute
    // over an index-signature type, which breaks `new LoyaltyTransaction({ metadata: {...} })`.
    @Column('jsonb', { nullable: true })
    metadata: any;

    /** Populated only once LoyaltySettings.expirationEnabled is turned on — always null today, and
     *  nothing currently filters on it. Schema-ready, not wired up. */
    @Column({ type: 'timestamp', nullable: true })
    expiresAt: Date | null;
}
