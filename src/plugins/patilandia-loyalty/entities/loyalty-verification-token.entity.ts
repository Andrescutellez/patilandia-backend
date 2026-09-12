import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { LoyaltyAccount } from './loyalty-account.entity';

/**
 * A single-use, expiring token backing patilandia-loyalty's own magic-link email verification (no
 * password, no login — see the plugin's plan/decisions notes for why this isn't Vendure's native
 * customer verification). The raw token is only ever in the email link; only its hash is persisted.
 */
@Entity()
export class LoyaltyVerificationToken extends VendureEntity {
    constructor(input?: DeepPartial<LoyaltyVerificationToken>) {
        super(input);
    }

    @Index()
    @ManyToOne(() => LoyaltyAccount, { onDelete: 'CASCADE' })
    @JoinColumn()
    account: LoyaltyAccount;

    @Index({ unique: true })
    @Column()
    tokenHash: string;

    @Column('timestamp')
    expiresAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    consumedAt: Date | null;
}
