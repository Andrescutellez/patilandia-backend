/**
 * Centralized "From"/"Reply-To" routing for every transactional email in the project — the single
 * place that turns the EMAIL_ADDRESS_* env vars into the exact string EmailEventHandler.setFrom()
 * expects, so no handler ever hardcodes an address. See vendure-config.ts's `smtpHost` check for
 * how the presence of SMTP_HOST (not APP_ENV) decides whether these need to be real at all.
 *
 * Category mapping (per product decision, not a Vendure convention):
 *  - pedidos:  order confirmation, order status changes, gift orders — anything about a purchase.
 *  - soporte:  password reset, email-address change — account trouble.
 *  - hola:     account verification, Patipuntos, subscription reminders — general customer contact.
 *  - ventas / contacto: reserved for future commercial/contact-form features, not used by any
 *    handler yet, but validated now so they're ready without a second round of env var setup.
 */
const emailFromName = process.env.EMAIL_FROM_NAME;
const emailReplyTo = process.env.EMAIL_REPLY_TO;
const addressPedidos = process.env.EMAIL_ADDRESS_PEDIDOS;
const addressVentas = process.env.EMAIL_ADDRESS_VENTAS;
const addressSoporte = process.env.EMAIL_ADDRESS_SOPORTE;
const addressHola = process.env.EMAIL_ADDRESS_HOLA;
const addressContacto = process.env.EMAIL_ADDRESS_CONTACTO;
// EMAIL_FROM_ADDRESS is the "principal" identity (today the same value as EMAIL_ADDRESS_PEDIDOS) —
// kept as its own var/SENDERS.default entry so a future handler that doesn't fit any of the 5
// categories still has a real, non-hardcoded fallback instead of reaching for one of the others.
const addressDefault = process.env.EMAIL_FROM_ADDRESS;

// Real sender identities are only required once we're actually sending real mail (see
// isSmtpConfigured in vendure-config.ts) — a contributor running `npm run dev:server` without any
// Purelymail credentials still gets a working dev-mailbox with a harmless placeholder sender.
const isSmtpConfigured = Boolean(process.env.SMTP_HOST);

const DEV_FALLBACK_ADDRESS = 'dev@localhost';
const DEV_FALLBACK_NAME = 'Patilandia (dev)';

function resolveRequired(name: string, value: string | undefined): string {
    if (value) {
        return value;
    }
    if (isSmtpConfigured) {
        throw new Error(`${name} debe estar configurada cuando SMTP_HOST está presente`);
    }
    return name === 'EMAIL_FROM_NAME' ? DEV_FALLBACK_NAME : DEV_FALLBACK_ADDRESS;
}

const fromName = resolveRequired('EMAIL_FROM_NAME', emailFromName);
const resolvedReplyTo = resolveRequired('EMAIL_REPLY_TO', emailReplyTo);
const resolvedPedidos = resolveRequired('EMAIL_ADDRESS_PEDIDOS', addressPedidos);
const resolvedVentas = resolveRequired('EMAIL_ADDRESS_VENTAS', addressVentas);
const resolvedSoporte = resolveRequired('EMAIL_ADDRESS_SOPORTE', addressSoporte);
const resolvedHola = resolveRequired('EMAIL_ADDRESS_HOLA', addressHola);
const resolvedContacto = resolveRequired('EMAIL_ADDRESS_CONTACTO', addressContacto);
const resolvedDefault = resolveRequired('EMAIL_FROM_ADDRESS', addressDefault);

function formatSender(address: string): string {
    return `"${fromName}" <${address}>`;
}

/** Pass directly to `.setFrom(SENDERS.pedidos)` etc. — these are plain, final strings (not
 *  Handlebars templates), computed once at startup from EMAIL_FROM_NAME + EMAIL_ADDRESS_*. */
export const SENDERS = {
    pedidos: formatSender(resolvedPedidos),
    ventas: formatSender(resolvedVentas),
    soporte: formatSender(resolvedSoporte),
    hola: formatSender(resolvedHola),
    contacto: formatSender(resolvedContacto),
    default: formatSender(resolvedDefault),
} as const;

/** Every handler sets this as its Reply-To via `.setOptionalAddressFields(() => ({ replyTo: REPLY_TO }))` —
 *  a single configurable address (EMAIL_REPLY_TO) rather than replying to whichever alias sent it,
 *  since Purelymail delivers all the aliases to the same two real mailboxes anyway. */
export const REPLY_TO = resolvedReplyTo;

/**
 * Base URL for static assets *embedded inside* an email body (today: the logo in
 * partials/header.hbs) — deliberately separate from STOREFRONT_URL (see vendure-config.ts). An
 * <img> is fetched by the recipient's mail client the instant they open the email, from wherever
 * they are, so it can never be a localhost/dev URL — even when the email itself was sent from a
 * dev/staging backend (this was the actual cause of the logo never rendering: it used
 * storefrontUrl, which is http://localhost:3001 outside of a real STOREFRONT_URL, meaningless to
 * Outlook/Gmail). Defaults to the real, already-deployed production storefront (verified reachable
 * over HTTPS before using it here) rather than an invented placeholder, since the logo doesn't vary
 * by environment. Override via EMAIL_ASSET_BASE_URL if the domain ever changes.
 */
export const EMAIL_ASSET_BASE_URL = process.env.EMAIL_ASSET_BASE_URL ?? 'https://patilandia.com.co';
