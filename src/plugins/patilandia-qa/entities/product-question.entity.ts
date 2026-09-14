import { DeepPartial, Product, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

@Entity()
export class ProductQuestion extends VendureEntity {
    constructor(input?: DeepPartial<ProductQuestion>) {
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

    @Column('text')
    question: string;

    /** Set together with `approved: true` by the moderator's answer action — a question only ever
     *  goes public once it has a real answer, there's no "approved but unanswered" state. */
    @Column({ type: 'text', nullable: true })
    answer: string | null;

    @Column({ type: 'timestamp', nullable: true })
    answeredAt: Date | null;

    /** New questions start unapproved — a moderator has to answer (or reject) before it's public. */
    @Column({ default: false })
    approved: boolean;
}
