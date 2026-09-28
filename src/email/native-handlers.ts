import {
    emailAddressChangeHandler,
    emailVerificationHandler,
    orderConfirmationHandler,
    passwordResetHandler,
} from '@vendure/email-plugin';

import { REPLY_TO, SENDERS } from './senders';
import { isCashOnDelivery } from './order-timing';

// EmailEventHandler.filter()/setFrom()/setOptionalAddressFields() all mutate the handler instance
// in place and return `this` (see @vendure/email-plugin's event-handler.js) — these ARE the same
// singletons @vendure/email-plugin exports as part of `defaultEmailHandlers`, customized here
// rather than duplicated, so vendure-config.ts's `handlers` array only ever lists one copy of each.

// Gift orders get their own template (see src/email/handlers/gift-order-confirmation-handler.ts) —
// this excludes them from the standard confirmation so a gift buyer doesn't get both. Cash-on-
// delivery orders are excluded too: this handler's underlying trigger (baked into
// @vendure/email-plugin, filters compose via AND — see order-timing.ts) is PaymentSettled, which a
// COD order only reaches much later when the admin settles it right before shipping, NOT when the
// order is placed — see codOrderConfirmationHandler for the real "your order is confirmed" email a
// COD customer actually gets, at PaymentAuthorized. Without this exclusion, a COD customer would
// get a confusing "¡Gracias por tu compra! Ya confirmamos tu pago" email weeks later, at shipping
// time, and never one when they actually placed the order.
//
// setSubject() is required here, not optional: @vendure/email-plugin's defaultEmailHandlers ship
// with English subjects ("Order confirmation for #{{ order.code }}", "Please verify your email
// address", "Forgotten password reset", "Please verify your change of email address") baked into
// the handler itself, not the .hbs body template — translating the body templates earlier never
// touched these, which is exactly why real customers kept receiving English subjects.
orderConfirmationHandler
    .filter(event => !event.order.customFields?.isGift && !isCashOnDelivery(event.order))
    .setFrom(SENDERS.pedidos)
    .setOptionalAddressFields(() => ({ replyTo: REPLY_TO }))
    .setSubject('¡Gracias por tu compra! Pedido #{{ order.code }}');

passwordResetHandler
    .setFrom(SENDERS.soporte)
    .setOptionalAddressFields(() => ({ replyTo: REPLY_TO }))
    .setSubject('Restablece tu contraseña — Patilandia');

emailAddressChangeHandler
    .setFrom(SENDERS.soporte)
    .setOptionalAddressFields(() => ({ replyTo: REPLY_TO }))
    .setSubject('Confirma tu nuevo correo — Patilandia');

emailVerificationHandler
    .setFrom(SENDERS.hola)
    .setOptionalAddressFields(() => ({ replyTo: REPLY_TO }))
    .setSubject('Confirma tu correo — Patilandia');

export {
    orderConfirmationHandler,
    passwordResetHandler,
    emailAddressChangeHandler,
    emailVerificationHandler,
};
