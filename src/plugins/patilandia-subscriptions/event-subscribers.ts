import { EventBus, Order, OrderStateTransitionEvent, RequestContext, TransactionalConnection } from '@vendure/core';
import { filter } from 'rxjs/operators';

import { SubscriptionService } from './services/subscription.service';

/** Wires up the one trigger that advances a subscription's schedule. Called once from the
 *  plugin's onApplicationBootstrap — see patilandia-subscriptions.plugin.ts. */
export function registerSubscriptionEventSubscribers(
    eventBus: EventBus,
    subscriptionService: SubscriptionService,
    connection: TransactionalConnection,
): void {
    eventBus
        .ofType(OrderStateTransitionEvent)
        .pipe(filter(event => event.toState === 'PaymentAuthorized'))
        .subscribe(event => {
            void handleOrderPaymentAuthorized(event.ctx, event.order, subscriptionService, connection);
        });
}

/**
 * Unlike Patipuntos (which defers a cash-on-delivery order's reward until `Delivered`, since
 * awarding points is handing out something of real, reversible value), this runs the same way for
 * prepaid AND cash-on-delivery orders: all it does is move the plugin's OWN reminder schedule
 * forward once the order has been legitimately placed. There's nothing here that could be
 * "given away" prematurely — worst case, a COD order that's later refused just means the next
 * reminder arrives a bit earlier than it strictly needed to.
 */
async function handleOrderPaymentAuthorized(
    ctx: RequestContext,
    eventOrder: Order,
    subscriptionService: SubscriptionService,
    connection: TransactionalConnection,
): Promise<void> {
    // Re-read rather than trust the event payload — same reasoning as patilandia-loyalty's
    // event-subscribers.ts: the EventBus doesn't guarantee relations are loaded on event.order.
    const order = await connection
        .getRepository(ctx, Order)
        .findOne({ where: { id: eventOrder.id }, relations: ['lines'] });
    if (!order || order.state === 'Cancelled') return;

    const anchorDate = new Date();
    for (const line of order.lines) {
        const subscriptionId = (line.customFields as { subscriptionId?: string | null } | undefined)
            ?.subscriptionId;
        if (!subscriptionId) continue;
        await subscriptionService.markRenewedFromOrder(ctx, subscriptionId, anchorDate);
    }
}
