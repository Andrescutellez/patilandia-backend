export const PATILANDIA_BOLD_PLUGIN_OPTIONS = Symbol('PATILANDIA_BOLD_PLUGIN_OPTIONS');
export const loggerCtx = 'PatilandiaBoldPlugin';

/** Same code registered as a PaymentMethod in configure-checkout.ts — never actually invoked to
 *  create the Payment (that happens via OrderService.addManualPaymentToOrder once Bold confirms),
 *  it only exists so the method shows up with a sensible name/code in the Admin UI. */
export const BOLD_PAYMENT_METHOD_CODE = 'bold';

/** Bold's real endpoints — identical for sandbox and production, only the keys differ (confirmed
 *  against developers.bold.co: "Asegúrate de que ambas llaves... correspondan al ambiente de
 *  pruebas" — no separate sandbox host). */
export const BOLD_TRANSACTION_STATUS_URL = 'https://payments.api.bold.co/v2/payment-voucher';
