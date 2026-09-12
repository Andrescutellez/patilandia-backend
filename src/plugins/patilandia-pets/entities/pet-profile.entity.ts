import { Customer, DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

@Entity()
export class PetProfile extends VendureEntity {
    constructor(input?: DeepPartial<PetProfile>) {
        super(input);
    }

    @Index()
    @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
    @JoinColumn()
    customer: Customer;

    @Column()
    name: string;

    /** 'dog' | 'cat' | 'other' — validated in the service, kept as a plain string here since it
     *  mirrors the storefront's existing PetType facet values rather than inventing a new enum. */
    @Column()
    species: string;

    @Column({ default: '' })
    breed: string;

    @Column({ type: 'timestamp', nullable: true })
    birthDate: Date | null;

    /** 'pequeno' | 'mediano' | 'grande' | '' — free-form on purpose, same reasoning as species. */
    @Column({ default: '' })
    sizeLabel: string;

    @Column('text', { default: '' })
    notes: string;
}
