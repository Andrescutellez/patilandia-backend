import { DeepPartial, Product, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

@Entity()
export class ProductReview extends VendureEntity {
    constructor(input?: DeepPartial<ProductReview>) {
        super(input);
    }

    @Index()
    @ManyToOne(() => Product, { onDelete: 'CASCADE' })
    @JoinColumn()
    product: Product;

    @Column()
    authorName: string;

    @Column()
    authorEmail: string;

    /** 1-5. */
    @Column('int')
    rating: number;

    @Column({ default: '' })
    title: string;

    @Column('text')
    body: string;

    /** New reviews start unapproved — a real person has to moderate them before they go public. */
    @Column({ default: false })
    approved: boolean;
}
