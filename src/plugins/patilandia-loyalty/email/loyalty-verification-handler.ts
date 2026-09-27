import { EmailEventListener } from '@vendure/email-plugin';

import { REPLY_TO, SENDERS } from '../../../email/senders';
import { LoyaltyEmailVerificationRequestedEvent } from '../events/loyalty-email-verification-requested-event';

/** Registered in vendure-config.ts's EmailPlugin `handlers` array, alongside `defaultEmailHandlers`.
 *  Template lives at static/email/templates/loyalty-email-verification/body.hbs. */
export const loyaltyVerificationHandler = new EmailEventListener('loyalty-email-verification')
    .on(LoyaltyEmailVerificationRequestedEvent)
    .setRecipient(event => event.email)
    .setFrom(SENDERS.hola)
    .setOptionalAddressFields(() => ({ replyTo: REPLY_TO }))
    .setSubject('Confirma tu correo para canjear tus Patipuntos')
    .setTemplateVars(event => ({ token: event.rawToken, email: event.email }));
