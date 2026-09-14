import { DeepPartial, Product, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, OneToMany, OneToOne } from 'typeorm';

import { PersonalizationField } from './personalization-field.entity';

/**
 * One per product — whether it can be personalized, how ("Bordado", free text so new methods
 * don't need a migration), the extra charge, and the list of fields the shopper fills in. Every
 * product starts without one of these; creating it (via `savePersonalizationConfig`) is what
 * turns "personalizable" on for that product specifically, never globally.
 */
@Entity()
export class PersonalizationConfig extends VendureEntity {
    constructor(input?: DeepPartial<PersonalizationConfig>) {
        super(input);
    }

    @Index({ unique: true })
    @OneToOne(() => Product, { onDelete: 'CASCADE' })
    @JoinColumn()
    product: Product;

    @Column({ default: false })
    enabled: boolean;

    /** Free-text label for what kind of personalization this is (e.g. "Bordado") — purely
     *  descriptive, doesn't drive any logic today. */
    @Column({ default: 'embroidery' })
    method: string;

    /** Same ×100 minor-unit convention as every other money value in this project (see
     *  ProductVariant.customFields.compareAtPrice for the same pattern). */
    @Column({ default: 0 })
    priceSurchargeMinorUnits: number;

    @OneToMany(() => PersonalizationField, field => field.config)
    fields: PersonalizationField[];
}
