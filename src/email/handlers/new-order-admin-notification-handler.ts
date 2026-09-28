import { EntityHydrator, OrderStateTransitionEvent } from '@vendure/core';
import { EmailEventListener, shippingLinesWithMethod, transformOrderLineAssetUrls } from '@vendure/email-plugin';

import { ADMIN_SALES_RECIPIENT, SENDERS } from '../senders';
import { isOrderPlacedTransition } from '../order-timing';

/**
 * The one handler in this project that notifies the store instead of the customer — every other
 * handler here sends TO whoever placed the order/asked the question/wrote the review. Unlike
 * orderConfirmationHandler/giftOrderConfirmationHandler/codOrderConfirmationHandler (each pinned to
 * one toState, mutually exclusive by payment method — see native-handlers.ts), this one handler
 * covers every order regardless of payment method or gift status, so its filter has to check BOTH
 * possible "genuinely placed" transitions itself — see order-timing.ts for why a cash-on-delivery
 * order needs PaymentAuthorized instead of PaymentSettled.
 */
export const newOrderAdminNotificationHandler = new EmailEventListener('new-order-admin-notification')
    .on(OrderStateTransitionEvent)
    .filter(isOrderPlacedTransition)
    .loadData(async ({ event, injector }) => {
        const entityHydrator = injector.get(EntityHydrator);
        await entityHydrator.hydrate(event.ctx, event.order, {
            relations: ['lines.featuredAsset', 'shippingLines.shippingMethod'],
        });
        transformOrderLineAssetUrls(event.ctx, event.order, injector);
        return { shippingLines: shippingLinesWithMethod(event.order) };
    })
    .setRecipient(() => ADMIN_SALES_RECIPIENT)
    .setFrom(SENDERS.pedidos)
    .setSubject('🎉 Nueva venta — pedido #{{ order.code }}')
    .setTemplateVars(event => ({
        order: event.order,
        shippingLines: event.data.shippingLines,
        isGift: event.order.customFields?.isGift ?? false,
    }));
