export const loggerCtx = 'PatilandiaMipaquetePlugin';

/** Same FulfillmentHandler.code pattern as patilandia-fulfillment-handler.ts's 'manual-fulfillment'
 *  — this one is used only by the automated post-payment shipment creation in event-subscribers.ts,
 *  never offered as a manual option in the Dashboard's "Cumplir pedido" dialog (an admin doing that
 *  by hand still picks 'manual-fulfillment', e.g. for a hand-delivered order). */
export const MIPAQUETE_FULFILLMENT_HANDLER_CODE = 'mipaquete-fulfillment';

/** Colombia's own DANE code, per mipaquete-api-v2.md section 4.12 — the one hardcoded location this
 *  integration ever compares against, for the "envío propio en Bogotá" toggle. */
export const BOGOTA_DANE_CODE = '11001000';

/** Country code Mi Paquete expects for Colombia (mipaquete-api-v2.md section 4.13) — Patilandia only
 *  ships within Colombia today, so this is the only one ever used. */
export const COLOMBIA_COUNTRY_CODE = '170';

/** How long a cached /getLocations or /getDeliveryCompanies response is trusted before re-fetching —
 *  both lists change rarely (new municipality, new carrier), so an hour-scale cache avoids hammering
 *  Mi Paquete on every city-search keystroke without risking stale data for long. */
export const MIPAQUETE_CATALOG_CACHE_TTL_MS = 60 * 60 * 1000;
