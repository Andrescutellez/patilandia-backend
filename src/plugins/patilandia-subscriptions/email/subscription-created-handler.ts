import { EmailEventListener } from '@vendure/email-plugin';

import { REPLY_TO, SENDERS } from '../../../email/senders';
import { SubscriptionCreatedEvent } from '../events/subscription-created-event';
import { SubscriptionService } from '../services/subscription.service';

/** Reuses SubscriptionService.getProductName — the same TranslatorService-based helper
 *  subscription-reminder-handler.ts's own event already carries a plain productName string for
 *  (that event resolves it at publish time in the scheduled task); this one resolves it here
 *  instead, via loadData, since SubscriptionCreatedEvent only carries the raw entity. */
export const subscriptionCreatedHandler = new EmailEventListener('subscription-created')
    .on(SubscriptionCreatedEvent)
    .loadData(async ({ event, injector }) => {
        const subscriptionService = injector.get(SubscriptionService);
        return { productName: subscriptionService.getProductName(event.ctx, event.subscription) };
    })
    .setRecipient(event => event.subscription.customer.emailAddress)
    .setFrom(SENDERS.hola)
    .setOptionalAddressFields(() => ({ replyTo: REPLY_TO }))
    .setSubject(event => `Tu suscripción a ${event.data.productName} está activa 🐾`)
    .setTemplateVars(event => ({
        firstName: event.subscription.customer.firstName,
        productName: event.data.productName,
        quantity: event.subscription.quantity,
        frequencyDays: event.subscription.frequencyDays,
        nextRenewalDate: event.subscription.nextRenewalDate,
    }));
