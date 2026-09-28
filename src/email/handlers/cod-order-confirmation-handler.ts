import { EntityHydrator, OrderStateTransitionEvent } from '@vendure/core';
import { EmailEventListener, shippingLinesWithMethod, transformOrderLineAssetUrls } from '@vendure/email-plugin';

import { REPLY_TO, SENDERS } from '../senders';
import { isCashOnDelivery } from '../order-timing';

/**
 * The confirmation a cash-on-delivery customer actually gets, in place of orderConfirmationHandler
 * (excluded for COD orders — see native-handlers.ts). Fires at PaymentAuthorized, the real "order
 * placed" moment for COD: no money exists yet (that's why PaymentSettled never happens here until
 * the admin settles it at shipping time — see patilandia-loyalty/event-subscribers.ts for the exact
 * same distinction applied to Patipuntos), so the copy says "recibimos tu pedido", never "confirmamos
 * tu pago". Covers gift COD orders too (no isGift split) — see gift-order-confirmation-handler.ts.
 */
export const codOrderConfirmationHandler = new EmailEventListener('cod-order-confirmation')
    .on(OrderStateTransitionEvent)
    .filter(
        event =>
            event.toState === 'PaymentAuthorized' &&
            event.fromState !== 'Modifying' &&
            !!event.order.customer &&
            isCashOnDelivery(event.order),
    )
    .loadData(async ({ event, injector }) => {
        const entityHydrator = injector.get(EntityHydrator);
        await entityHydrator.hydrate(event.ctx, event.order, {
            relations: ['lines.featuredAsset', 'shippingLines.shippingMethod'],
        });
        transformOrderLineAssetUrls(event.ctx, event.order, injector);
        return { shippingLines: shippingLinesWithMethod(event.order) };
    })
    .setRecipient(event => event.order.customer!.emailAddress)
    .setFrom(SENDERS.pedidos)
    .setOptionalAddressFields(() => ({ replyTo: REPLY_TO }))
    .setSubject('Recibimos tu pedido #{{ order.code }} — pagas contra entrega')
    .setTemplateVars(event => ({
        order: event.order,
        shippingLines: event.data.shippingLines,
    }));
