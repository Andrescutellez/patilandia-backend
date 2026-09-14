import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { GoodsReceiptLine } from './goods-receipt-line.entity';
import { PurchaseOrder } from './purchase-order.entity';

/**
 * One row per discrete "goods arrived, we checked it in" event — not just a running counter on
 * PurchaseOrderLine. This is what makes a partial receipt auditable (when did each batch actually
 * arrive) and, together with `idempotencyKey`, what makes it safe against a duplicate submission
 * (a retried network request for the same receipt is a no-op, not a second stock increase) — see
 * PurchaseOrderService.receiveGoods.
 */
@Entity()
export class GoodsReceipt extends VendureEntity {
    constructor(input?: DeepPartial<GoodsReceipt>) {
        super(input);
    }

    @ManyToOne(() => PurchaseOrder, { onDelete: 'CASCADE' })
    @JoinColumn()
    purchaseOrder: PurchaseOrder;

    @Column({ type: 'timestamp' })
    receivedAt: Date;

    @Index({ unique: true, where: '"idempotencyKey" IS NOT NULL' })
    @Column({ type: 'varchar', nullable: true })
    idempotencyKey: string | null;

    @OneToMany(() => GoodsReceiptLine, line => line.goodsReceipt, { cascade: true })
    lines: GoodsReceiptLine[];
}
