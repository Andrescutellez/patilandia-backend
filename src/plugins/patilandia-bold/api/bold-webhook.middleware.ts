import { Logger } from '@vendure/core';
import { NextFunction, Request, Response } from 'express';

import { loggerCtx } from '../constants';
import { PatilandiaBoldPlugin } from '../patilandia-bold.plugin';
import { BoldPaymentStatusValue } from '../types';

const APPROVED_EVENT_TYPES = new Set(['SALE_APPROVED']);

/** Bold's CloudEvents-style payload doesn't have its nested `data` shape nailed down 100% by the
 *  public docs (they only promise "merchant id, payment method, amount, taxes, payer email,
 *  custom metadata/references"). `reference_id` matches the field name Bold's own active-query
 *  endpoint uses for the same concept, so it's the primary guess — the other two are defensive
 *  fallbacks. This MUST be confirmed against a real payload from Bold's sandbox "Probar el
 *  webhook" button before relying on this in production; the raw body is logged below specifically
 *  so that's easy to check via `pm2 logs`. Until confirmed, the active-query poll on the
 *  confirmation page (bold.service.ts#getPaymentStatus) is the safety net that still settles the
 *  order even if this extraction ever comes back empty. */
function extractReferenceId(data: Record<string, unknown> | undefined): string | undefined {
    if (!data) return undefined;
    const metadata = data.metadata as Record<string, unknown> | undefined;
    return (
        (data.reference_id as string | undefined) ??
        (data.order_id as string | undefined) ??
        (metadata?.reference_id as string | undefined)
    );
}

function extractTransactionId(data: Record<string, unknown> | undefined, subject: string | undefined): string {
    return (data?.transaction_id as string | undefined) ?? subject ?? 'unknown';
}

/**
 * A plain Express handler rather than a NestJS-DI `NestMiddleware` class — Vendure's
 * `apiOptions.middleware` resolves each route's middleware through a Nest module context that
 * does NOT see this plugin's own providers (confirmed against the real server: even after
 * exporting BoldService from PatilandiaBoldPlugin, constructor-injecting it into a NestMiddleware
 * class here throws UnknownDependenciesException at bootstrap). Reading BoldService off the
 * plugin's own static reference — set once in onApplicationBootstrap, the same lifecycle hook
 * every other Patilandia plugin already uses for its own one-time setup — sidesteps that
 * resolution path entirely instead of fighting it.
 */
export async function boldWebhookHandler(req: Request, res: Response, _next: NextFunction) {
    const boldService = PatilandiaBoldPlugin.boldService;
    const rawBody = req.body as Buffer;
    const signatureHeader = req.header('x-bold-signature');

    if (!Buffer.isBuffer(rawBody) || !boldService.verifyWebhookSignature(rawBody, signatureHeader)) {
        Logger.warn('Webhook de Bold con firma inválida — rechazado', loggerCtx);
        res.status(401).send('invalid signature');
        return;
    }

    let payload: { type?: string; subject?: string; data?: Record<string, unknown> };
    try {
        payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
        Logger.warn('Webhook de Bold con body no-JSON tras verificar la firma', loggerCtx);
        res.status(400).send('invalid body');
        return;
    }

    Logger.info(`Webhook de Bold recibido: ${JSON.stringify(payload)}`, loggerCtx);

    // Always 200 once the signature checks out — even for a rejected sale — so Bold doesn't keep
    // retrying an event we've already understood and decided not to act on.
    res.status(200).send('ok');

    const orderCode = extractReferenceId(payload.data);
    if (!orderCode) {
        Logger.warn(`Webhook de Bold sin reference_id reconocible: ${JSON.stringify(payload.data)}`, loggerCtx);
        return;
    }
    if (!APPROVED_EVENT_TYPES.has(payload.type ?? '')) {
        return;
    }

    const transactionId = extractTransactionId(payload.data, payload.subject);
    try {
        await boldService.settleFromWebhook(orderCode, transactionId, 'APPROVED' as BoldPaymentStatusValue);
    } catch (err) {
        Logger.error(
            `Error asentando el pago de Bold desde el webhook para ${orderCode}: ${err instanceof Error ? err.message : err}`,
            loggerCtx,
        );
    }
}
