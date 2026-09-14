import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { PersonalizationField } from './personalization-field.entity';

/** One choice inside a `select`-type field — e.g. "Dorado" for a "Color del bordado" field. */
@Entity()
export class PersonalizationFieldOption extends VendureEntity {
    constructor(input?: DeepPartial<PersonalizationFieldOption>) {
        super(input);
    }

    @Index()
    @ManyToOne(() => PersonalizationField, field => field.options, { onDelete: 'CASCADE' })
    @JoinColumn()
    field: PersonalizationField;

    @Column()
    label: string;

    /** The machine-readable value that travels through the cart/order — kept separate from
     *  `label` so relabeling an option later doesn't change what's already stored on past orders
     *  (the order snapshot stores the label text directly anyway, see PersonalizationField). */
    @Column()
    value: string;

    /** Hex color for the visual swatch (e.g. "#D4AF37") — null for options that don't need one.
     *  Explicit `type: 'varchar'`: TypeORM can't infer a column type from a `string | null` union
     *  via reflection (it sees `Object`), a known gotcha already hit elsewhere in this project. */
    @Column({ type: 'varchar', nullable: true })
    colorHex: string | null;

    @Column({ default: 0 })
    sortOrder: number;
}
