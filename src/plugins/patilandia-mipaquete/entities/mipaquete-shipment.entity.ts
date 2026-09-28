import { DeepPartial, Order, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';

/** 'PENDING' only exists transiently inside the transaction that creates this row — in practice a
 *  row is always written already CREATED or FAILED, never left PENDING across requests. Kept as an
 *  explicit state (not inferred from "mpCode is null") so a genuinely-failed attempt is
 *  unambiguous and can be found/retried without guessing. */
export type MipaqueteShipmentState = 'PENDING' | 'CREATED' | 'FAILED' | 'CANCELLED';

/**
 * The source of truth for "what did we actually send Mi Paquete for this order, and what did it
 * say back" — one row per Order (an order is always exactly one physical package, per Patilandia's
 * own packing rule, see services/packing.ts). Deliberately its own entity rather than more
 * Order.customFields: unlike the gift/loyalty customFields (a handful of flat values written once),
 * this needs real state (PENDING/CREATED/FAILED) plus a growing audit trail
 * (mpCode → guía → tracking → posible cancelación) that's exactly the kind of thing this project
 * already gives its own entity when it matters (see LoyaltyTransaction, GoodsReceipt).
 *
 * `idempotencyKey` (unique) is the actual duplicate-shipment guard — event-subscribers.ts inserts
 * this row (state CREATED, with the real mpCode) inside the same transaction it calls
 * /createSending in, so a retried event or a re-delivered webhook can never create a second real
 * shipment for the same order: the second attempt's insert fails on the unique constraint first.
 */
@Entity()
export class MipaqueteShipment extends VendureEntity {
    constructor(input?: DeepPartial<MipaqueteShipment>) {
        super(input);
    }

    @Index({ unique: true })
    @OneToOne(() => Order, { onDelete: 'CASCADE' })
    @JoinColumn()
    order: Order;

    @Index({ unique: true })
    @Column()
    idempotencyKey: string;

    @Column()
    state: MipaqueteShipmentState;

    /** Mi Paquete's own code for this shipment (mpCode) — null until /createSending succeeds. Used
     *  for tracking/cancellation and to match incoming webhooks (`code` field in both payloads) back
     *  to this row. */
    @Column({ type: 'int', nullable: true })
    mpCode: number | null;

    @Column({ type: 'varchar', nullable: true })
    deliveryCompanyId: string | null;

    @Column({ type: 'varchar', nullable: true })
    deliveryCompanyName: string | null;

    /** What we told Mi Paquete to charge for (Vendure money minor units) — the same figure the
     *  mipaquete-carrier-calculator returned at checkout, snapshotted here for audit even though the
     *  real charge lives on Order.shippingWithTax. */
    @Column('int')
    shippingCostMinorUnits: number;

    /** Snapshot of the single packed box actually quoted/sent — see packing.ts. Kept here (not just
     *  recomputed later) because the order's lines could theoretically change after the fact
     *  (a cancelled line, a modification) and this is what Mi Paquete was actually told. */
    @Column('int')
    packageWeightKg: number;
    @Column('int')
    packageLength: number;
    @Column('int')
    packageWidth: number;
    @Column('int')
    packageHeight: number;

    /** Populated once the `urlForGuides` webhook arrives (see api/mipaquete-webhook.middleware.ts) —
     *  null until then. Mirrored onto the matching Fulfillment's trackingCode/customFields.trackingUrl
     *  at that same moment, which is what emails and "/pedido/[code]" actually read — this column is
     *  the durable record, not a second read path. */
    @Column({ type: 'varchar', nullable: true })
    trackingCode: string | null;

    /** Array of guide/despacho PDF URLs, exactly as Mi Paquete's webhook sends them. */
    @Column('jsonb', { nullable: true })
    pdfGuideUrls: string[] | null;

    @Column({ type: 'varchar', nullable: true })
    pickupCode: string | null;

    /** The Vendure Fulfillment this shipment was materialized as (see event-subscribers.ts) — kept
     *  so the guide webhook can find and update it directly (there is no native "update fulfillment"
     *  mutation in Vendure, confirmed against the real Admin API schema). */
    @Column({ type: 'varchar', nullable: true })
    fulfillmentId: string | null;

    /** Set when state is FAILED — surfaced in the Dashboard so a payment that couldn't get a real
     *  shipment created stays visible and actionable instead of silently lost. Never used to retry
     *  automatically (see plan: no auto-retry, no duplicate risk). */
    @Column({ type: 'text', nullable: true })
    lastError: string | null;
}
