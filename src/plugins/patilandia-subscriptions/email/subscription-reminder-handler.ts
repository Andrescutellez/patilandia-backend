import { EmailEventListener } from '@vendure/email-plugin';

import { REPLY_TO, SENDERS } from '../../../email/senders';
import { SubscriptionReminderDueEvent } from '../events/subscription-reminder-due-event';

/** Registered in vendure-config.ts's EmailPlugin `handlers` array, alongside `defaultEmailHandlers`.
 *  Template lives at static/email/templates/subscription-reminder/body.hbs. */
export const subscriptionReminderHandler = new EmailEventListener('subscription-reminder')
    .on(SubscriptionReminderDueEvent)
    .setRecipient(event => event.email)
    .setFrom(SENDERS.hola)
    .setOptionalAddressFields(() => ({ replyTo: REPLY_TO }))
    .setSubject(event => `Es hora de recomprar ${event.productName} 🔄`)
    .setTemplateVars(event => ({ productName: event.productName, subscriptionId: event.subscriptionId }));
