/**
 * @description
 * The plugin can be configured using the following options:
 */
export interface PluginInitOptions {
    /** "Llave de identidad" — safe to expose to the browser, identifies the merchant. */
    identityKey: string;
    /** "Llave secreta" — server-only, signs the integrity hash and the webhook HMAC. Never send
     *  this to the storefront. */
    secretKey: string;
    /** Bold's own docs: sandbox and production hit the exact same URLs, only the keys differ.
     *  Kept here anyway (not just inferred from NODE_ENV) so a sandbox key pair can be used
     *  against a "production-configured" server during testing without a code change. */
    sandbox: boolean;
    /** Same value as vendure-config.ts's own `storefrontUrl` — used to build the redirect target
     *  Bold sends the shopper back to once they finish paying. */
    storefrontUrl: string;
}

export interface BoldCheckoutData {
    apiKey: string;
    orderId: string;
    amount: number;
    currency: 'COP';
    signature: string;
    redirectionUrl: string;
}

export type BoldPaymentStatusValue =
    | 'APPROVED'
    | 'REJECTED'
    | 'FAILED'
    | 'VOIDED'
    | 'PROCESSING'
    | 'PENDING'
    | 'NO_TRANSACTION_FOUND';

export interface BoldPaymentStatus {
    orderCode: string;
    status: BoldPaymentStatusValue;
    /** True once the Vendure order itself is confirmed paid (PaymentSettled or beyond) —
     *  the storefront should only show the success screen once this is true, not just because
     *  Bold said APPROVED, in case settling races with the read. */
    orderSettled: boolean;
}
