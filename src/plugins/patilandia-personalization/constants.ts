export const PATILANDIA_PERSONALIZATION_PLUGIN_OPTIONS = Symbol('PATILANDIA_PERSONALIZATION_PLUGIN_OPTIONS');
export const loggerCtx = 'PatilandiaPersonalizationPlugin';

/** The only field types the storefront/admin editor know how to render today. Free-form string on
 *  the entity (not a hard TypeORM/GraphQL enum) so adding 'image'/'icon' later is just adding a
 *  value here plus a render case on each side — no migration, no schema-breaking change. */
export const PERSONALIZATION_FIELD_TYPES = ['text', 'select'] as const;
export type PersonalizationFieldType = (typeof PERSONALIZATION_FIELD_TYPES)[number];
