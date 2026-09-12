import { Customer, DeepPartial, Product, VendureEntity } from '@vendure/core';
import { Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

@Entity()
export class WishlistItem extends VendureEntity {
    constructor(input?: DeepPartial<WishlistItem>) {
        super(input);
    }

    @Index()
    @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
    @JoinColumn()
    customer: Customer;

    @Index()
    @ManyToOne(() => Product, { onDelete: 'CASCADE' })
    @JoinColumn()
    product: Product;
}
