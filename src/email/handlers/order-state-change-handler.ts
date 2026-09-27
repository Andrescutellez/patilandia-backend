import { EntityHydrator, OrderState, OrderStateTransitionEvent } from '@vendure/core';
import { EmailEventListener } from '@vendure/email-plugin';

import { REPLY_TO, SENDERS } from '../senders';

/**
 * Vendure 3.7.3's default order process (verified against node_modules/@vendure/core's
 * order-state.d.ts — this project doesn't configure a custom `orderOptions.process`, so these are
 * the real states, not aspirational ones) doesn't include a generic "order state changed" email at
 * all — `defaultEmailHandlers` only covers PaymentSettled (via orderConfirmationHandler). This
 * handler fills that gap for the states a customer actually cares about hearing from us about.
 *
 * PaymentSettled/PaymentAuthorized are deliberately excluded — orderConfirmationHandler (or
 * giftOrderConfirmationHandler) already covers that transition; sending both would duplicate the
 * "your order is confirmed" moment. Cancelled is included since it has no other email today.
 *
 * Idempotency: Vendure's own state machine only emits OrderStateTransitionEvent on a transition
 * that actually committed — re-requesting a transition into a state the order is already in is
 * rejected before the event fires, so the same transition can't double-send through this listener.
 * No separate dedupe table is needed on top of that guarantee.
 */
// Exported so order-state-change-handler.test.ts can assert on the real business rule (which
// states notify, and that PaymentSettled/PaymentAuthorized are deliberately absent) without
// needing a live Vendure server/DB to construct a full OrderStateTransitionEvent.
export const NOTIFIABLE_STATES: OrderState[] = [
    'PartiallyShipped',
    'Shipped',
    'PartiallyDelivered',
    'Delivered',
    'Cancelled',
];

export const STATE_COPY: Partial<Record<OrderState, { subject: string; heading: string; message: string }>> = {
    PartiallyShipped: {
        subject: 'Parte de tu pedido #{{ order.code }} ya salió',
        heading: 'Parte de tu pedido ya está en camino',
        message: 'Ya despachamos parte de los productos de tu pedido. El resto sale en un envío aparte.',
    },
    Shipped: {
        subject: 'Tu pedido #{{ order.code }} ya está en camino',
        heading: '¡Tu pedido ya salió!',
        message: 'Despachamos tu pedido — pronto va a llegar a la dirección que registraste.',
    },
    PartiallyDelivered: {
        subject: 'Parte de tu pedido #{{ order.code }} fue entregado',
        heading: 'Parte de tu pedido ya llegó',
        message: 'Ya te entregamos parte de los productos de tu pedido. El resto llega por separado.',
    },
    Delivered: {
        subject: '¡Tu pedido #{{ order.code }} fue entregado!',
        heading: '¡Tu pedido llegó!',
        message: 'Confirmamos la entrega de tu pedido. Esperamos que a tu mascota le encante.',
    },
    Cancelled: {
        subject: 'Tu pedido #{{ order.code }} fue cancelado',
        heading: 'Tu pedido fue cancelado',
        message: 'Tu pedido quedó cancelado. Si no lo esperabas o tienes dudas, responde este correo.',
    },
};

export const orderStateChangeHandler = new EmailEventListener('order-state-change')
    .on(OrderStateTransitionEvent)
    .filter(
        event =>
            NOTIFIABLE_STATES.includes(event.toState) && event.fromState !== 'Modifying' && !!event.order.customer,
    )
    .loadData(async ({ event, injector }) => {
        const entityHydrator = injector.get(EntityHydrator);
        await entityHydrator.hydrate(event.ctx, event.order, { relations: ['fulfillments'] });
        const trackingCode = event.order.fulfillments?.find(f => f.trackingCode)?.trackingCode ?? null;
        return { trackingCode };
    })
    .setRecipient(event => event.order.customer!.emailAddress)
    .setFrom(SENDERS.pedidos)
    .setOptionalAddressFields(() => ({ replyTo: REPLY_TO }))
    .setSubject(event => STATE_COPY[event.toState]?.subject ?? 'Actualización de tu pedido #{{ order.code }}')
    .setTemplateVars(event => ({
        order: event.order,
        heading: STATE_COPY[event.toState]?.heading ?? 'Tu pedido cambió de estado',
        message: STATE_COPY[event.toState]?.message ?? `Nuevo estado: ${event.toState}.`,
        trackingCode: event.data.trackingCode,
        isShipped: event.toState === 'Shipped' || event.toState === 'PartiallyShipped',
        isCancelled: event.toState === 'Cancelled',
    }));
