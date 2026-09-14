import { Customer, DeepPartial, Product, VendureEntity } from '@vendure/core';
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

    /** Who actually submitted this — a real session if they were logged in, otherwise an existing
     *  Customer that already had this email (never created just for leaving a review). ProductReviewService.submit()
     *  requires this to resolve to someone with a verified purchase of the product, so for any
     *  review submitted after that check was added this is never null — nullable only because
     *  older rows from before the check existed may still have it unset, and the FK must survive
     *  that customer being deleted (`onDelete: 'SET NULL'`) without deleting the review. */
    @Index()
    @ManyToOne(() => Customer, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn()
    customer: Customer | null;

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
