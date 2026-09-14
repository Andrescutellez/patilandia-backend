import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { PurchaseOrderStatus } from '../constants';
import { PurchaseOrderLine } from './purchase-order-line.entity';
import { Supplier } from './supplier.entity';

@Entity()
export class PurchaseOrder extends VendureEntity {
    constructor(input?: DeepPartial<PurchaseOrder>) {
        super(input);
    }

    @ManyToOne(() => Supplier, { onDelete: 'RESTRICT' })
    @JoinColumn()
    supplier: Supplier;

    @Column({ type: 'varchar', default: 'BORRADOR' })
    status: PurchaseOrderStatus;

    @Column({ type: 'timestamp' })
    orderDate: Date;

    @Column({ type: 'text', default: '' })
    notes: string;

    @OneToMany(() => PurchaseOrderLine, line => line.purchaseOrder, { cascade: true })
    lines: PurchaseOrderLine[];
}
