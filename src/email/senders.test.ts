import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// senders.ts reads process.env at *module load* time (a top-level const, matching this project's
// established env-var pattern in vendure-config.ts), so each test needs a fresh module instance —
// vi.resetModules() + a fresh process.env snapshot, not just re-importing the cached module.

const REQUIRED_KEYS = [
    'EMAIL_FROM_NAME',
    'EMAIL_FROM_ADDRESS',
    'EMAIL_REPLY_TO',
    'EMAIL_ADDRESS_PEDIDOS',
    'EMAIL_ADDRESS_VENTAS',
    'EMAIL_ADDRESS_SOPORTE',
    'EMAIL_ADDRESS_HOLA',
    'EMAIL_ADDRESS_CONTACTO',
] as const;

const REAL_VALUES: Record<(typeof REQUIRED_KEYS)[number], string> = {
    EMAIL_FROM_NAME: 'Patilandia',
    EMAIL_FROM_ADDRESS: 'pedidos@patilandia.com.co',
    EMAIL_REPLY_TO: 'pedidos@patilandia.com.co',
    EMAIL_ADDRESS_PEDIDOS: 'pedidos@patilandia.com.co',
    EMAIL_ADDRESS_VENTAS: 'ventas@patilandia.com.co',
    EMAIL_ADDRESS_SOPORTE: 'soporte@patilandia.com.co',
    EMAIL_ADDRESS_HOLA: 'hola@patilandia.com.co',
    EMAIL_ADDRESS_CONTACTO: 'contacto@patilandia.com.co',
};

const originalEnv = { ...process.env };

function resetEnv() {
    for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) {
            delete process.env[key];
        }
    }
    Object.assign(process.env, originalEnv);
    delete process.env.SMTP_HOST;
    for (const key of REQUIRED_KEYS) {
        delete process.env[key];
    }
}

beforeEach(() => {
    resetEnv();
    vi.resetModules();
});

afterEach(() => {
    resetEnv();
});

describe('email senders', () => {
    it('falls back to a harmless dev sender when SMTP_HOST is not set, even with no EMAIL_* vars', async () => {
        const { SENDERS, REPLY_TO } = await import('./senders.js');
        expect(SENDERS.pedidos).toContain('dev@localhost');
        expect(REPLY_TO).toBe('dev@localhost');
    });

    it('throws a clear, secret-free error when SMTP_HOST is set but an EMAIL_* var is missing', async () => {
        process.env.SMTP_HOST = 'smtp.purelymail.com';
        Object.assign(process.env, REAL_VALUES);
        delete process.env.EMAIL_ADDRESS_SOPORTE;

        await expect(import('./senders.js')).rejects.toThrow('EMAIL_ADDRESS_SOPORTE');
    });

    it('builds the exact "Display Name <address>" string setFrom() expects, per category', async () => {
        process.env.SMTP_HOST = 'smtp.purelymail.com';
        Object.assign(process.env, REAL_VALUES);

        const { SENDERS } = await import('./senders.js');
        expect(SENDERS.pedidos).toBe('"Patilandia" <pedidos@patilandia.com.co>');
        expect(SENDERS.ventas).toBe('"Patilandia" <ventas@patilandia.com.co>');
        expect(SENDERS.soporte).toBe('"Patilandia" <soporte@patilandia.com.co>');
        expect(SENDERS.hola).toBe('"Patilandia" <hola@patilandia.com.co>');
        expect(SENDERS.contacto).toBe('"Patilandia" <contacto@patilandia.com.co>');
        expect(SENDERS.default).toBe('"Patilandia" <pedidos@patilandia.com.co>');
    });

    it('uses EMAIL_REPLY_TO as-is for REPLY_TO, independent of the sender addresses', async () => {
        process.env.SMTP_HOST = 'smtp.purelymail.com';
        Object.assign(process.env, REAL_VALUES);
        process.env.EMAIL_REPLY_TO = 'soporte@patilandia.com.co';

        const { REPLY_TO } = await import('./senders.js');
        expect(REPLY_TO).toBe('soporte@patilandia.com.co');
    });

    it('never includes SMTP_PASSWORD in any exported value (it has no reason to touch it)', async () => {
        process.env.SMTP_HOST = 'smtp.purelymail.com';
        process.env.SMTP_PASSWORD = 'super-secret-app-password';
        Object.assign(process.env, REAL_VALUES);

        const senders = await import('./senders.js');
        const serialized = JSON.stringify(senders);
        expect(serialized).not.toContain('super-secret-app-password');
    });
});

describe('EMAIL_ASSET_BASE_URL', () => {
    // The actual bug this guards against: partials/header.hbs used to embed the logo via
    // {{ storefrontUrl }}, which defaults to http://localhost:3001 outside of a real
    // STOREFRONT_URL — meaningless to a mail client opening the email anywhere else. This is a
    // *different* var specifically so a real, always-public URL is used for embedded images
    // regardless of which environment (including local dev) sent the email.
    it('defaults to the real, public Patilandia domain — never localhost — when unset', async () => {
        const { EMAIL_ASSET_BASE_URL } = await import('./senders.js');
        expect(EMAIL_ASSET_BASE_URL).toBe('https://patilandia.com.co');
        expect(EMAIL_ASSET_BASE_URL).not.toContain('localhost');
    });

    it('is overridable via the env var, for if the domain ever changes', async () => {
        process.env.EMAIL_ASSET_BASE_URL = 'https://cdn.example-future-domain.co';
        const { EMAIL_ASSET_BASE_URL } = await import('./senders.js');
        expect(EMAIL_ASSET_BASE_URL).toBe('https://cdn.example-future-domain.co');
    });

    it('is independent of whether SMTP_HOST is configured — always resolves to a real URL', async () => {
        // Unlike SENDERS/REPLY_TO, this one has no separate "dev fallback" branch — it doesn't
        // need one, since its default is already a real, safe, always-correct URL.
        const notConfigured = await import('./senders.js');
        expect(notConfigured.EMAIL_ASSET_BASE_URL).toBe('https://patilandia.com.co');

        vi.resetModules();
        process.env.SMTP_HOST = 'smtp.purelymail.com';
        Object.assign(process.env, REAL_VALUES);
        const configured = await import('./senders.js');
        expect(configured.EMAIL_ASSET_BASE_URL).toBe('https://patilandia.com.co');
    });
});
