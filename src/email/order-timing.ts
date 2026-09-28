import type { Order, OrderStateTransitionEvent } from '@vendure/core';

// Same code/local-constant pattern as patilandia-loyalty/event-subscribers.ts and
// patilandia-reviews/product-review.service.ts — duplicated rather than imported across the
// plugin boundary, but here shared within src/email/ since all three handlers that need it live
// in this same module.
const CASH_ON_DELIVERY_PAYMENT_METHOD_CODE = 'cash-on-delivery';

export function isCashOnDelivery(order: Order): boolean {
    return order.payments?.some(payment => payment.method === CASH_ON_DELIVERY_PAYMENT_METHOD_CODE) ?? false;
}

/**
 * The moment an order is genuinely "placed" and worth confirming — for a prepaid order that's
 * PaymentSettled (the money is secured), but for cash-on-delivery it's PaymentAuthorized instead:
 * no money exists yet, and PaymentSettled for a COD order only happens much later, when the admin
 * settles it right before shipping (see patilandia-loyalty/event-subscribers.ts, which applies this
 * exact same timing distinction to Patipuntos). Used by newOrderAdminNotificationHandler, which
 * needs to fire exactly once per order regardless of payment method — orderConfirmationHandler and
 * codOrderConfirmationHandler instead just check their own single toState directly, since Vendure's
 * EmailEventHandler.filter() calls AND-compose (see native-handlers.ts) rather than letting one
 * handler react to two different toState values.
 */
export function isOrderPlacedTransition(event: OrderStateTransitionEvent): boolean {
    if (event.fromState === 'Modifying' || !event.order.customer) return false;
    return isCashOnDelivery(event.order)
        ? event.toState === 'PaymentAuthorized'
        : event.toState === 'PaymentSettled';
}
