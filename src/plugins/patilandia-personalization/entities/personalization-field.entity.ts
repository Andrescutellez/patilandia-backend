import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { PersonalizationConfig } from './personalization-config.entity';
import { PersonalizationFieldOption } from './personalization-field-option.entity';

/** One question the shopper answers on the product page — e.g. "Nombre de tu mascota" (a `text`
 *  field) or "Color del bordado" (a `select` field, see its `options`). */
@Entity()
export class PersonalizationField extends VendureEntity {
    constructor(input?: DeepPartial<PersonalizationField>) {
        super(input);
    }

    @Index()
    @ManyToOne(() => PersonalizationConfig, config => config.fields, { onDelete: 'CASCADE' })
    @JoinColumn()
    config: PersonalizationConfig;

    @Column()
    label: string;

    /** 'text' | 'select' today — see PERSONALIZATION_FIELD_TYPES in constants.ts. Plain string, not
     *  a closed enum, so a future type (e.g. 'image') is just a new value, not a migration. */
    @Column()
    fieldType: string;

    @Column({ default: '' })
    placeholder: string;

    @Column({ default: true })
    required: boolean;

    /** Only meaningful for 'text' fields. */
    @Column({ type: 'int', nullable: true })
    maxLength: number | null;

    @Column({ default: 0 })
    sortOrder: number;

    /** Only populated for 'select' fields. */
    @OneToMany(() => PersonalizationFieldOption, option => option.field)
    options: PersonalizationFieldOption[];
}
