import { DeepPartial, ProductVariant, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { SourcingType } from '../constants';
import { Supplier } from './supplier.entity';

/**
 * The source of truth for "where does this product come from" — not just informational. A
 * PurchaseOrderLine can only be created for a (supplier, productVariant) pair that already has a
 * row here (see PurchaseOrderService), so receiving goods always knows unambiguously whether that
 * line's receipt should touch real stock (INVENTARIO_PROPIO) or not (DROPSHIPPING never does).
 */
@Entity()
@Index(['supplier', 'productVariant'], { unique: true })
export class SupplierProductVariant extends VendureEntity {
    constructor(input?: DeepPartial<SupplierProductVariant>) {
        super(input);
    }

    @ManyToOne(() => Supplier, supplier => supplier.productVariants, { onDelete: 'CASCADE' })
    @JoinColumn()
    supplier: Supplier;

    // Points at Vendure's own real ProductVariant — never a copy. The catalog stays the single
    // source of truth for what a "product" is; this table only adds sourcing metadata on top.
    @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
    @JoinColumn()
    productVariant: ProductVariant;

    @Column({ default: '' })
    supplierSku: string;

    @Column({ type: 'varchar' })
    sourcingType: SourcingType;

    @Column({ type: 'int', default: 0 })
    currentCostMinorUnits: number;
}
