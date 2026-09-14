import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { GoodsReceipt } from './goods-receipt.entity';
import { PurchaseOrderLine } from './purchase-order-line.entity';

@Entity()
export class GoodsReceiptLine extends VendureEntity {
    constructor(input?: DeepPartial<GoodsReceiptLine>) {
        super(input);
    }

    @ManyToOne(() => GoodsReceipt, receipt => receipt.lines, { onDelete: 'CASCADE' })
    @JoinColumn()
    goodsReceipt: GoodsReceipt;

    @ManyToOne(() => PurchaseOrderLine, { onDelete: 'RESTRICT' })
    @JoinColumn()
    purchaseOrderLine: PurchaseOrderLine;

    /** Only THIS receipt's quantity — not cumulative (that's PurchaseOrderLine.quantityReceived). */
    @Column({ type: 'int' })
    quantityReceived: number;
}
