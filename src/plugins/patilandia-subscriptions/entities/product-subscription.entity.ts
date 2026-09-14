import { Address, Customer, DeepPartial, ProductVariant, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { SubscriptionStatus } from '../constants';

@Entity()
export class ProductSubscription extends VendureEntity {
    constructor(input?: DeepPartial<ProductSubscription>) {
        super(input);
    }

    @Index()
    @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
    @JoinColumn()
    customer: Customer;

    // The product itself is derived by navigating `productVariant.product` — storing a second FK
    // here would just be a copy of data already reachable through the variant.
    @Index()
    @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
    @JoinColumn()
    productVariant: ProductVariant;

    // Points at the customer's own native Vendure address book (see CustomerService.createAddress)
    // rather than a copy owned by this plugin — an Order's shippingAddress is a one-time snapshot,
    // but a subscription's address needs to outlive many future orders, which is exactly what
    // Vendure's real Address entity (unlike OrderAddress) is for. Nullable + SET NULL because the
    // customer could delete this address from their book later — see SubscriptionService for how
    // that edge case is handled (skipped, not auto-fixed).
    @ManyToOne(() => Address, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn()
    shippingAddress: Address | null;

    @Column()
    quantity: number;

    @Column()
    frequencyDays: number;

    @Column({ type: 'varchar', default: 'ACTIVE' })
    status: SubscriptionStatus;

    @Column({ type: 'timestamp' })
    nextRenewalDate: Date;

    // Cleared back to null every time nextRenewalDate advances (see markRenewedFromOrder) — null
    // means "not yet reminded for the current due date", so the daily job never reminds twice for
    // the same cycle.
    @Column({ type: 'timestamp', nullable: true })
    reminderSentAt: Date | null;
}
