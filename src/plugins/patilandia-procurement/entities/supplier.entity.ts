import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, OneToMany } from 'typeorm';

import { SupplierProductVariant } from './supplier-product-variant.entity';

@Entity()
export class Supplier extends VendureEntity {
    constructor(input?: DeepPartial<Supplier>) {
        super(input);
    }

    @Column()
    name: string;

    @Column({ default: '' })
    contactName: string;

    @Column({ default: '' })
    phone: string;

    @Column({ default: '' })
    whatsapp: string;

    @Column({ default: '' })
    email: string;

    @Column({ type: 'text', default: '' })
    address: string;

    @Column({ type: 'text', default: '' })
    notes: string;

    @Column({ default: true })
    active: boolean;

    @OneToMany(() => SupplierProductVariant, spv => spv.supplier)
    productVariants: SupplierProductVariant[];
}
