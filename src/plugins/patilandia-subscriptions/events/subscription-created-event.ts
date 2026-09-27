import { RequestContext, VendureEvent } from '@vendure/core';

import { ProductSubscription } from '../entities/product-subscription.entity';

/** Published once a customer sets up a new repurchase subscription (SubscriptionService.create) —
 *  distinct from SubscriptionReminderDueEvent, which fires much later, once per renewal cycle. */
export class SubscriptionCreatedEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public subscription: ProductSubscription,
    ) {
        super();
    }
}
