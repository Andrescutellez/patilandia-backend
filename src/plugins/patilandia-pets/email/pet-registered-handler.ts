import { EmailEventListener } from '@vendure/email-plugin';

import { REPLY_TO, SENDERS } from '../../../email/senders';
import { PetProfileCreatedEvent } from '../events/pet-profile-created-event';

/** PetProfileService validates species against exactly these 3 codes (VALID_SPECIES in
 *  pet-profile.service.ts) — stored/queried as the English code, never translated at rest, so the
 *  email (unlike the storefront form, which maps its own display labels client-side) needs its own
 *  mapping to avoid showing "dog" in a Spanish email. */
const SPECIES_LABEL: Record<string, string> = { dog: 'perro', cat: 'gato', other: 'mascota' };

/** Same event patilandia-loyalty already subscribes to for the PET_REGISTERED bonus — this just
 *  adds a second, independent subscriber for the confirmation email. Neither plugin needs to know
 *  about the other's subscription. */
export const petRegisteredHandler = new EmailEventListener('pet-registered')
    .on(PetProfileCreatedEvent)
    .setRecipient(event => event.petProfile.customer.emailAddress)
    .setFrom(SENDERS.hola)
    .setOptionalAddressFields(() => ({ replyTo: REPLY_TO }))
    .setSubject(event => `¡${event.petProfile.name} ya está en Patilandia! 🐾`)
    .setTemplateVars(event => ({
        petName: event.petProfile.name,
        species: SPECIES_LABEL[event.petProfile.species] ?? event.petProfile.species,
        breed: event.petProfile.breed,
        ownerName: event.petProfile.ownerName,
    }));
