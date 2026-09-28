import { EventBus, Order, OrderStateTransitionEvent, RequestContext, TransactionalConnection } from '@vendure/core';
import { filter } from 'rxjs/operators';

import { isOrderPlacedTransition } from '../../email/order-timing';

import { MipaqueteService } from './services/mipaquete.service';

/**
 * Creates the real Mi Paquete shipment exactly when an order is genuinely placed — reusing
 * src/email/order-timing.ts's isOrderPlacedTransition (built earlier this session for the same
 * "prepaid at PaymentSettled, cash-on-delivery at PaymentAuthorized" distinction the email handlers
 * already rely on), so this fires at the same moment a customer's order-confirmation email does,
 * never earlier (no shipment for an order that's still just a cart) and never twice.
 */
export function registerMipaqueteEventSubscribers(
    eventBus: EventBus,
    mipaqueteService: MipaqueteService,
    connection: TransactionalConnection,
): void {
    eventBus
        .ofType(OrderStateTransitionEvent)
        .pipe(filter(isOrderPlacedTransition))
        .subscribe(event => {
            void handleOrderPlaced(event.ctx, event.order, mipaqueteService, connection);
        });
}

async function handleOrderPlaced(
    ctx: RequestContext,
    eventOrder: Order,
    mipaqueteService: MipaqueteService,
    connection: TransactionalConnection,
): Promise<void> {
    // Re-read rather than trust the event payload — same reasoning as
    // patilandia-loyalty/event-subscribers.ts's loadOrderForAward: event delivery order isn't
    // guaranteed, so a Cancelled racing this one must not create a shipment for a dead order.
    const order = await connection
        .getRepository(ctx, Order)
        .findOne({ where: { id: eventOrder.id }, relations: ['customer'] });
    if (!order || order.state === 'Cancelled') return;

    await mipaqueteService.createShipmentForOrder(ctx, order);
}
