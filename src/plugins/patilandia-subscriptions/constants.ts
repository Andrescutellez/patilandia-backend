export const PATILANDIA_SUBSCRIPTIONS_PLUGIN_OPTIONS = Symbol('PATILANDIA_SUBSCRIPTIONS_PLUGIN_OPTIONS');
export const loggerCtx = 'PatilandiaSubscriptionsPlugin';

/** Fixed system-wide options — the user explicitly did not want per-product frequency
 *  configuration for this MVP. */
export const SUBSCRIPTION_FREQUENCIES_DAYS = [15, 30, 45, 60, 90] as const;

export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';
export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['ACTIVE', 'PAUSED', 'CANCELLED'];
