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

    /** Free-text name of the pet's owner, captured directly on the pet form — kept separate from
     *  `customer.firstName`/`lastName` because a guest identified only by email (see
     *  resolveOrCreateRequestingCustomer below) often has no real name on that Customer row, e.g.
     *  just the email's local-part. Optional and blank for pets created before this field existed. */
    @Column({ default: '' })
    ownerName: string;

    @Column({ type: 'timestamp', nullable: true })
    birthDate: Date | null;

    /** 'pequeno' | 'mediano' | 'grande' | '' — free-form on purpose, same reasoning as species. */
    @Column({ default: '' })
    sizeLabel: string;

    @Column('text', { default: '' })
    notes: string;
}
