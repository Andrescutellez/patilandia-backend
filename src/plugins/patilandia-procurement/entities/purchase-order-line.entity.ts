import { DeepPartial, ProductVariant, VendureEntity } from '@vendure/core';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { PurchaseOrder } from './purchase-order.entity';

@Entity()
export class PurchaseOrderLine extends VendureEntity {
    constructor(input?: DeepPartial<PurchaseOrderLine>) {
        super(input);
    }

    @ManyToOne(() => PurchaseOrder, order => order.lines, { onDelete: 'CASCADE' })
    @JoinColumn()
    purchaseOrder: PurchaseOrder;

    @ManyToOne(() => ProductVariant, { onDelete: 'RESTRICT' })
    @JoinColumn()
    productVariant: ProductVariant;

    @Column({ type: 'int' })
    quantityOrdered: number;

    /** Cumulative — the running total across every GoodsReceiptLine for this line, never reset. */
    @Column({ type: 'int', default: 0 })
    quantityReceived: number;

    @Column({ type: 'int' })
    unitCostMinorUnits: number;
}
