import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity } from 'typeorm';

/**
 * Singleton — a single row holding the storefront's WhatsApp configuration. Same convention as
 * patilandia-loyalty's LoyaltySettings: WhatsappSettingsService.getSettings() always fetches/creates
 * the first row; there is no mechanism enforcing "exactly one row" beyond the service never
 * inserting a second one.
 */
@Entity()
export class WhatsappSettings extends VendureEntity {
    constructor(input?: DeepPartial<WhatsappSettings>) {
        super(input);
    }

    /** Stored exactly as the admin typed it (spaces/dashes/+ and all) — normalized to digits-only
     *  only when a wa.me link is actually built, never in the database. Empty string means "not
     *  configured yet", not an error — the storefront treats that the same as `enabled: false`. */
    @Column({ default: '' })
    phoneNumber: string;

    /** Lets the admin hide every WhatsApp button/link sitewide without deleting the number. */
    @Column({ default: true })
    enabled: boolean;

    /** Used by the floating button whenever no page has set a more specific contextual message. */
    @Column({ type: 'text', default: 'Hola, quiero más información sobre Patilandia 🐾' })
    defaultMessage: string;
}
