import { RequestContext, VendureEvent } from '@vendure/core';

/** Published by the daily scheduled task (see scheduled-tasks/subscription-reminder.task.ts) for
 *  every subscription that just became due — the email handler (email/subscription-reminder-
 *  handler.ts) listens for this to actually send the mail. */
export class SubscriptionReminderDueEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public email: string,
        public productName: string,
        public subscriptionId: string,
    ) {
        super();
    }
}
