/**
 * One-off: registra en Mi Paquete las 2 URLs de webhook (guía y estado) que ya expone
 * patilandia-mipaquete.plugin.ts (`/mipaquete/webhook/guides` y `/mipaquete/webhook/states`),
 * con el header secreto que el receptor valida.
 *
 * Mi Paquete no soporta firma de webhooks (mipaquete-api-v2.md sección 6) — la mitigación
 * documentada es un header secreto propio, registrado vía updateAndDisableWebhook (createWebHook
 * no acepta `headers` según la doc). Por eso son 2 llamadas: crear, y luego actualizar para
 * adjuntar el secreto.
 *
 * Solo hace falta correrlo una vez por entorno (o de nuevo si cambia el dominio del backend).
 * No bootstrapea Vendure — solo llama la API de Mi Paquete directamente.
 *
 *   npx ts-node src/scripts/register-mipaquete-webhooks.ts
 */
import 'dotenv/config';

import { MipaqueteClient } from '../plugins/patilandia-mipaquete/services/mipaquete-client';

async function run() {
    const baseUrl = process.env.MIPAQUETE_WEBHOOK_BASE_URL;
    const secret = process.env.MIPAQUETE_WEBHOOK_SECRET;
    if (!baseUrl) {
        throw new Error('MIPAQUETE_WEBHOOK_BASE_URL no está configurada (dominio público del backend, sin slash final)');
    }
    if (!secret) {
        throw new Error('MIPAQUETE_WEBHOOK_SECRET no está configurada');
    }

    const urlForGuides = `${baseUrl}/mipaquete/webhook/guides`;
    const urlForStates = `${baseUrl}/mipaquete/webhook/states`;

    const client = new MipaqueteClient();

    console.log(`Creando webhook -> guías: ${urlForGuides} | estados: ${urlForStates}`);
    await client.createWebHook({
        urlForGuides: { urlClient: urlForGuides, enabled: true },
        urlForStates: { urlClient: urlForStates, enabled: true },
    });
    console.log('  ✔ createWebHook ok');

    console.log('Adjuntando header x-webhook-secret…');
    await client.updateAndDisableWebhook({
        urlForGuides: { urlClient: urlForGuides, enabled: true, headers: [{ name: 'x-webhook-secret', value: secret }] },
        urlForStates: { urlClient: urlForStates, enabled: true, headers: [{ name: 'x-webhook-secret', value: secret }] },
    });
    console.log('  ✔ updateAndDisableWebhook ok');

    console.log('Webhooks de Mi Paquete registrados.');
}

run()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Falló el registro de webhooks de Mi Paquete:', err);
        process.exit(1);
    });
