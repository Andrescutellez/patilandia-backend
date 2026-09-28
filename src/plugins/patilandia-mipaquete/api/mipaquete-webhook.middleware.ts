import { Logger } from '@vendure/core';
import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

import { loggerCtx } from '../constants';
import { PatilandiaMipaquetePlugin } from '../patilandia-mipaquete.plugin';

const webhookSecret = process.env.MIPAQUETE_WEBHOOK_SECRET;

/** Mi Paquete's webhooks docs (mipaquete-api-v2.md section 6) don't describe a signature scheme —
 *  the recommended approach is a custom header registered ourselves via createWebHook/
 *  updateAndDisableWebhook's `headers` option, echoed back on every call. Constant-time compare,
 *  same defensive habit as Bold's HMAC check even though this is a plain shared-secret match. */
function verifyWebhookSecret(headerValue: string | undefined): boolean {
    if (!webhookSecret || !headerValue) return false;
    const expected = Buffer.from(webhookSecret, 'utf8');
    const received = Buffer.from(headerValue, 'utf8');
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
}

interface GuideWebhookPayload {
    guideNumber?: string;
    pdfGuide?: string[];
    pickupCode?: string;
    tracking?: Array<{ updateState: string; date: string; description?: string }>;
    code: number;
}

interface StateWebhookPayload {
    state: string;
    tracking?: Array<{ updateState: string; date: string; description?: string }>;
    code: number;
}

/** A plain Express handler rather than NestJS-DI, same reasoning as patilandia-bold's
 *  bold-webhook.middleware.ts: apiOptions.middleware resolves outside this plugin's own Nest module
 *  context, so constructor-injecting MipaqueteService here throws UnknownDependenciesException at
 *  bootstrap. Reads the service off the plugin's own static reference instead, set once in
 *  onApplicationBootstrap — same lifecycle hook every Patilandia plugin already uses. */
export async function mipaqueteGuideWebhookHandler(req: Request, res: Response, _next: NextFunction) {
    if (!verifyWebhookSecret(req.header('x-webhook-secret'))) {
        Logger.warn('Webhook de guía de Mi Paquete con secreto inválido — rechazado', loggerCtx);
        res.status(401).send('invalid secret');
        return;
    }

    const payload = req.body as GuideWebhookPayload;
    Logger.info(`Webhook de guía de Mi Paquete recibido: ${JSON.stringify(payload)}`, loggerCtx);
    res.status(200).send('ok'); // Always 200 once the secret checks out, so Mi Paquete doesn't retry.

    if (!payload?.code) {
        Logger.warn('Webhook de guía de Mi Paquete sin "code" (mpCode) reconocible', loggerCtx);
        return;
    }

    try {
        await PatilandiaMipaquetePlugin.mipaqueteService.applyGuideWebhook(payload.code, {
            trackingCode: payload.guideNumber ?? null,
            pdfGuideUrls: payload.pdfGuide ?? null,
            pickupCode: payload.pickupCode ?? null,
        });
    } catch (err) {
        Logger.error(
            `Error aplicando el webhook de guía de Mi Paquete para mpCode ${payload.code}: ${err instanceof Error ? err.message : err}`,
            loggerCtx,
        );
    }
}

export async function mipaqueteStateWebhookHandler(req: Request, res: Response, _next: NextFunction) {
    if (!verifyWebhookSecret(req.header('x-webhook-secret'))) {
        Logger.warn('Webhook de estado de Mi Paquete con secreto inválido — rechazado', loggerCtx);
        res.status(401).send('invalid secret');
        return;
    }

    const payload = req.body as StateWebhookPayload;
    Logger.info(`Webhook de estado de Mi Paquete recibido: ${JSON.stringify(payload)}`, loggerCtx);
    res.status(200).send('ok');

    if (!payload?.code) {
        Logger.warn('Webhook de estado de Mi Paquete sin "code" (mpCode) reconocible', loggerCtx);
        return;
    }

    try {
        await PatilandiaMipaquetePlugin.mipaqueteService.applyStateWebhook(payload.code, payload.state);
    } catch (err) {
        Logger.error(
            `Error aplicando el webhook de estado de Mi Paquete para mpCode ${payload.code}: ${err instanceof Error ? err.message : err}`,
            loggerCtx,
        );
    }
}
