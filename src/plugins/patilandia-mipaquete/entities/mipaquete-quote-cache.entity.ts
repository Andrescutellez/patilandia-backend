import { DeepPartial, Order, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';

/**
 * One row per Order — the last real /quoteShipping response, kept only long enough to let the
 * checkout's shipping-method radio list resolve without re-quoting Mi Paquete for every single
 * carrier's ShippingEligibilityChecker + ShippingCalculator call (Vendure invokes both, per
 * candidate method, on every `eligibleShippingMethods` query). `requestHash` is a hash of exactly
 * the inputs that would change the real quote (destination DANE code + the packed
 * weight/length/width/height) — MipaqueteService only calls the real API again when that hash
 * changes, e.g. because the shopper edited their address or the cart.
 */
@Entity()
export class MipaqueteQuoteCache extends VendureEntity {
    constructor(input?: DeepPartial<MipaqueteQuoteCache>) {
        super(input);
    }

    @Index({ unique: true })
    @OneToOne(() => Order, { onDelete: 'CASCADE' })
    @JoinColumn()
    order: Order;

    @Column()
    requestHash: string;

    /** The raw array /quoteShipping returned (one entry per carrier — id, deliveryCompanyId,
     *  deliveryCompanyName, shippingCost, shippingTime, etc.) — see mipaquete-client.ts's
     *  QuoteShippingResult type for the exact shape. Re-parsed by the shipping checkers/calculators
     *  rather than re-typed here, so this entity doesn't need to change if Mi Paquete adds a field. */
    @Column('jsonb')
    quote: unknown;

    @Column()
    quotedAt: Date;
}
