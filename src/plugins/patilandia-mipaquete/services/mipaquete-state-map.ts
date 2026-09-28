/**
 * Mi Paquete's `urlForStates` webhook sends free-text Spanish state strings — mipaquete-api-v2.md
 * section 7 is explicit that there's no official catalog ("tratar el estado como string libre").
 * Matching by substring rather than an exact lookup table is deliberate: it's more resilient to
 * exact wording Patilandia hasn't seen yet in the sandbox (a state ending in "-o"/"-a" variant, a
 * courier-specific phrasing, etc.) than an exhaustive exact-match table would be. Anything that
 * doesn't clearly mean shipped/delivered/cancelled returns `null` — the caller just logs it and
 * leaves the Fulfillment alone, never guesses.
 *
 * IMPORTANT: verify this against real webhook payloads from Mi Paquete's sandbox before relying on
 * it in production — same caution already applied to Bold's webhook payload shape in this codebase
 * (see patilandia-bold/api/bold-webhook.middleware.ts's extractReferenceId comment). Extend the
 * three arrays below from real logs (MipaqueteService.applyStateWebhook logs every unrecognized
 * state) rather than guessing more phrasings up front.
 */

const CANCELLED_PATTERNS = ['cancelad'];
const DELIVERED_PATTERNS = ['entregad'];
const SHIPPED_PATTERNS = ['distribuci', 'en camino', 'despachad', 'envío programado', 'envio programado'];

function normalize(state: string): string {
    return state
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, ''); // strip accents so "envío"/"envio" match the same pattern
}

export function mapMipaqueteStateToFulfillmentState(mipaqueteState: string): 'Shipped' | 'Delivered' | 'Cancelled' | null {
    const normalized = normalize(mipaqueteState);
    if (CANCELLED_PATTERNS.some(p => normalized.includes(normalize(p)))) return 'Cancelled';
    if (DELIVERED_PATTERNS.some(p => normalized.includes(normalize(p)))) return 'Delivered';
    if (SHIPPED_PATTERNS.some(p => normalized.includes(normalize(p)))) return 'Shipped';
    return null;
}
