import { EntityHydrator, OrderStateTransitionEvent } from '@vendure/core';
import { EmailEventListener, shippingLinesWithMethod, transformOrderLineAssetUrls } from '@vendure/email-plugin';

import { REPLY_TO, SENDERS } from '../senders';
import { isCashOnDelivery } from '../order-timing';

/**
 * The gift-order counterpart to Vendure's own `orderConfirmationHandler` — same trigger
 * (PaymentSettled) and the same hydration/asset-URL utilities the native handler uses internally
 * (both exported publicly by @vendure/email-plugin for exactly this kind of reuse), but only for
 * orders where the shopper toggled "¿Es un regalo?" at checkout (patilandia-gifts,
 * Order.customFields.isGift — see patilandia-gifts/types.ts for the type augmentation). The native
 * handler is filtered in src/email/native-handlers.ts to exclude these, so a gift order gets this
 * template instead of the standard one, never both.
 *
 * Cash-on-delivery gift orders are excluded too, same reasoning as native-handlers.ts: PaymentSettled
 * only happens for COD once the admin settles it at shipping time, not when the order is placed. A
 * COD gift order gets codOrderConfirmationHandler's plain (non-gift-flavored) confirmation instead —
 * a deliberate v1 simplification, since a customer actually getting *some* confirmation matters more
 * here than gift-specific wording for what should be a rare combination.
 */
export const giftOrderConfirmationHandler = new EmailEventListener('gift-order-confirmation')
    .on(OrderStateTransitionEvent)
    .filter(
        event =>
            event.toState === 'PaymentSettled' &&
            event.fromState !== 'Modifying' &&
            !!event.order.customer &&
            !!event.order.customFields?.isGift &&
            !isCashOnDelivery(event.order),
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
    .setSubject('🎁 ¡Tu regalo está confirmado! Pedido #{{ order.code }}')
    .setTemplateVars(event => ({
        order: event.order,
        shippingLines: event.data.shippingLines,
        giftWrap: event.order.customFields?.giftWrap ?? false,
        giftMessage: event.order.customFields?.giftMessage ?? null,
        giftSenderName: event.order.customFields?.giftSenderName ?? null,
        giftAnonymous: event.order.customFields?.giftAnonymous ?? false,
    }));
