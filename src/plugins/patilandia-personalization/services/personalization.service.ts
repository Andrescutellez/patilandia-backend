import { Injectable, Inject } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { Product, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';

import { PERSONALIZATION_FIELD_TYPES } from '../constants';
import { PersonalizationConfig } from '../entities/personalization-config.entity';
import { PersonalizationField } from '../entities/personalization-field.entity';
import { PersonalizationFieldOption } from '../entities/personalization-field-option.entity';
import { PATILANDIA_PERSONALIZATION_PLUGIN_OPTIONS } from '../constants';
import { PluginInitOptions } from '../types';

export interface PersonalizationFieldOptionInput {
    label: string;
    value: string;
    colorHex?: string | null;
    sortOrder?: number;
}

export interface PersonalizationFieldInput {
    label: string;
    fieldType: string;
    placeholder?: string;
    required?: boolean;
    maxLength?: number | null;
    sortOrder?: number;
    options?: PersonalizationFieldOptionInput[];
}

export interface SavePersonalizationConfigInput {
    productId: ID;
    enabled: boolean;
    method?: string;
    priceSurchargeMinorUnits?: number;
    fields: PersonalizationFieldInput[];
}

const CONFIG_RELATIONS = ['fields', 'fields.options', 'product'];

/**
 * Admin/Shop CRUD for a product's personalization config. Note that the pricing decision itself
 * (`PersonalizationPriceCalculationStrategy`) does NOT go through this service — it's instantiated
 * outside any Nest module in vendure-config.ts, so it can only reach genuinely global providers
 * like `TransactionalConnection`, not this plugin's own service; it duplicates the same tiny
 * lookup instead (confirmed against the real server: injecting this service into that strategy
 * throws `UnknownElementException` at bootstrap).
 */
@Injectable()
export class PersonalizationService {
    constructor(
        private connection: TransactionalConnection,
        @Inject(PATILANDIA_PERSONALIZATION_PLUGIN_OPTIONS) private options: PluginInitOptions,
    ) {}

    /** Admin API — the config for a product whether enabled or not, so the Dashboard block can
     *  show it (possibly toggled off) instead of always starting from a blank form. */
    findForProductAdmin(ctx: RequestContext, productId: ID): Promise<PersonalizationConfig | null> {
        return this.connection.getRepository(ctx, PersonalizationConfig).findOne({
            where: { product: { id: productId } },
            relations: CONFIG_RELATIONS,
            order: { fields: { sortOrder: 'ASC', options: { sortOrder: 'ASC' } } },
        });
    }

    /** Shop API — only ever returns something if the product is actually personalizable right
     *  now; a disabled config is the same as "nothing configured" from the storefront's point of
     *  view, so it never shows a stale/half-off personalization panel. */
    async findEnabledForProduct(ctx: RequestContext, productId: ID): Promise<PersonalizationConfig | null> {
        const config = await this.findForProductAdmin(ctx, productId);
        return config?.enabled ? config : null;
    }

    /** Admin API — replaces the whole config (enabled flag, price, and every field/option) in one
     *  call. Wipes and recreates fields/options rather than diffing them — this is an infrequent
     *  admin action, not a hot path, and "replace everything" is far simpler and less bug-prone
     *  than reconciling adds/edits/removals/reorders against existing rows. */
    async save(ctx: RequestContext, input: SavePersonalizationConfigInput): Promise<PersonalizationConfig> {
        for (const field of input.fields) {
            if (!field.label.trim()) {
                throw new UserInputError('Cada campo necesita un nombre');
            }
            if (!PERSONALIZATION_FIELD_TYPES.includes(field.fieldType as (typeof PERSONALIZATION_FIELD_TYPES)[number])) {
                throw new UserInputError(`Tipo de campo inválido: ${field.fieldType}`);
            }
            if (field.fieldType === 'select' && (!field.options || field.options.length === 0)) {
                throw new UserInputError(`El campo "${field.label}" necesita al menos una opción`);
            }
        }

        const product = await this.connection.getEntityOrThrow(ctx, Product, input.productId, {
            channelId: ctx.channelId,
        });

        let config = await this.connection.getRepository(ctx, PersonalizationConfig).findOne({
            where: { product: { id: product.id } },
            relations: ['fields'],
        });

        if (config) {
            // Cascade delete on PersonalizationField -> PersonalizationFieldOption takes care of
            // the options underneath each removed field.
            if (config.fields.length) {
                await this.connection.getRepository(ctx, PersonalizationField).remove(config.fields);
            }
        } else {
            config = new PersonalizationConfig({ product });
        }

        config.enabled = input.enabled;
        config.method = input.method?.trim() || 'embroidery';
        config.priceSurchargeMinorUnits = input.priceSurchargeMinorUnits ?? 0;
        config = await this.connection.getRepository(ctx, PersonalizationConfig).save(config);

        for (const [fieldIndex, fieldInput] of input.fields.entries()) {
            const field = await this.connection.getRepository(ctx, PersonalizationField).save(
                new PersonalizationField({
                    config,
                    label: fieldInput.label.trim(),
                    fieldType: fieldInput.fieldType,
                    placeholder: fieldInput.placeholder?.trim() ?? '',
                    required: fieldInput.required ?? true,
                    maxLength: fieldInput.fieldType === 'text' ? (fieldInput.maxLength ?? null) : null,
                    sortOrder: fieldInput.sortOrder ?? fieldIndex,
                }),
            );

            if (fieldInput.fieldType === 'select' && fieldInput.options) {
                for (const [optionIndex, optionInput] of fieldInput.options.entries()) {
                    await this.connection.getRepository(ctx, PersonalizationFieldOption).save(
                        new PersonalizationFieldOption({
                            field,
                            label: optionInput.label.trim(),
                            value: optionInput.value.trim(),
                            colorHex: optionInput.colorHex?.trim() || null,
                            sortOrder: optionInput.sortOrder ?? optionIndex,
                        }),
                    );
                }
            }
        }

        return (await this.findForProductAdmin(ctx, product.id)) as PersonalizationConfig;
    }
}
