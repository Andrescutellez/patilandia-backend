import { EventBus, ScheduledTask } from '@vendure/core';

import { SubscriptionReminderDueEvent } from '../events/subscription-reminder-due-event';
import { SubscriptionService } from '../services/subscription.service';

/** Daily job — finds every ACTIVE subscription whose nextRenewalDate has arrived and hasn't been
 *  reminded yet (reminderSentAt is null), publishes one reminder event per subscription, and marks
 *  it reminded so the next day's run doesn't nag again for the same cycle. Never charges anything —
 *  see SubscriptionService's doc comment. */
export const subscriptionReminderTask = new ScheduledTask({
    id: 'patilandia-subscriptions-reminder',
    description: 'Manda el recordatorio de recompra a las suscripciones que ya llegaron a su fecha',
    schedule: cron => cron.everyDayAt(7, 0),
    execute: async ({ injector, scheduledContext }) => {
        const subscriptionService = injector.get(SubscriptionService);
        const eventBus = injector.get(EventBus);

        const due = await subscriptionService.findDueForReminder(scheduledContext);
        let reminded = 0;
        for (const subscription of due) {
            await eventBus.publish(
                new SubscriptionReminderDueEvent(
                    scheduledContext,
                    subscription.customer.emailAddress,
                    subscriptionService.getProductName(scheduledContext, subscription),
                    String(subscription.id),
                ),
            );
            await subscriptionService.markReminderSent(scheduledContext, subscription.id);
            reminded++;
        }
        return { checked: due.length, reminded };
    },
});
