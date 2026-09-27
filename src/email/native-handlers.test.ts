import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// native-handlers.ts resolves SENDERS/REPLY_TO from senders.ts at *module import* time (a
// top-level side effect: `.setFrom(SENDERS.pedidos)` etc. runs once, immediately). Without real
// SMTP_HOST/EMAIL_* env vars, senders.ts falls back to one identical dev placeholder for every
// category (see senders.ts's resolveRequired) — fine for local dev, but useless for asserting
// "orderConfirmationHandler sends from pedidos@, not hola@". So this sets the real env vars and
// dynamically imports the module fresh, the same way senders.test.ts does.
const originalEnv = { ...process.env };
const REAL_VALUES: Record<string, string> = {
    EMAIL_FROM_NAME: 'Patilandia',
    EMAIL_FROM_ADDRESS: 'pedidos@patilandia.com.co',
    EMAIL_REPLY_TO: 'pedidos@patilandia.com.co',
    EMAIL_ADDRESS_PEDIDOS: 'pedidos@patilandia.com.co',
    EMAIL_ADDRESS_VENTAS: 'ventas@patilandia.com.co',
    EMAIL_ADDRESS_SOPORTE: 'soporte@patilandia.com.co',
    EMAIL_ADDRESS_HOLA: 'hola@patilandia.com.co',
    EMAIL_ADDRESS_CONTACTO: 'contacto@patilandia.com.co',
};

let orderConfirmationHandler: typeof import('./native-handlers').orderConfirmationHandler;
let emailVerificationHandler: typeof import('./native-handlers').emailVerificationHandler;
let passwordResetHandler: typeof import('./native-handlers').passwordResetHandler;
let emailAddressChangeHandler: typeof import('./native-handlers').emailAddressChangeHandler;

beforeAll(async () => {
    process.env.SMTP_HOST = 'smtp.purelymail.com';
    Object.assign(process.env, REAL_VALUES);
    const mod = await import('./native-handlers.js');
    orderConfirmationHandler = mod.orderConfirmationHandler;
    emailVerificationHandler = mod.emailVerificationHandler;
    passwordResetHandler = mod.passwordResetHandler;
    emailAddressChangeHandler = mod.emailAddressChangeHandler;
});

afterAll(() => {
    for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
});

/** setSubject()/setFrom() called with a plain string store it as `defaultSubject`/`from` directly
 *  (see @vendure/email-plugin's event-handler.js) — no public getter exists, same reasoning as
 *  wouldFire() below for reaching into the handler's own state. */
function subjectAndFromOf(handler: unknown): { subject: string; from: string } {
    const h = handler as { defaultSubject?: string; from?: string };
    return { subject: h.defaultSubject ?? '', from: h.from ?? '' };
}

/**
 * EmailEventHandler.filter() pushes onto a private `filterFns` array and every one must pass for
 * the handler to fire (AND-composed — see @vendure/email-plugin's event-handler.js). There's no
 * public API to ask "would this handler fire for this event" without a live Vendure server, so
 * this reaches into that array directly to exercise the real, composed predicate — the actual bug
 * this guards against (a gift buyer getting both order-confirmation AND gift-order-confirmation)
 * only shows up when ALL filters are evaluated together, not any single one in isolation.
 */
function wouldFire(event: unknown): boolean {
    const filterFns = (orderConfirmationHandler as unknown as { filterFns: Array<(e: unknown) => boolean> })
        .filterFns;
    return filterFns.every(fn => fn(event));
}

function buildEvent(overrides: { isGift?: boolean; toState?: string; fromState?: string; hasCustomer?: boolean }) {
    return {
        toState: overrides.toState ?? 'PaymentSettled',
        fromState: overrides.fromState ?? 'ArrangingPayment',
        order: {
            customer: overrides.hasCustomer === false ? null : { emailAddress: 'test@example.com' },
            customFields: { isGift: overrides.isGift ?? false },
        },
    };
}

describe('orderConfirmationHandler (customized in native-handlers.ts)', () => {
    it('fires for a regular (non-gift) order reaching PaymentSettled', () => {
        expect(wouldFire(buildEvent({ isGift: false }))).toBe(true);
    });

    it('does NOT fire for a gift order — that goes to giftOrderConfirmationHandler instead', () => {
        expect(wouldFire(buildEvent({ isGift: true }))).toBe(false);
    });

    it('still respects the original Vendure filters (state, fromState, customer present)', () => {
        expect(wouldFire(buildEvent({ isGift: false, toState: 'Shipped' }))).toBe(false);
        expect(wouldFire(buildEvent({ isGift: false, fromState: 'Modifying' }))).toBe(false);
        expect(wouldFire(buildEvent({ isGift: false, hasCustomer: false }))).toBe(false);
    });
});

describe('native handler subjects (real bug: @vendure/email-plugin ships English subjects on the handler itself, not in the .hbs body — translating templates alone never touched these)', () => {
    it('orderConfirmationHandler is no longer "Order confirmation for #{{ order.code }}"', () => {
        const { subject, from } = subjectAndFromOf(orderConfirmationHandler);
        expect(subject).not.toMatch(/order confirmation/i);
        expect(subject).toContain('{{ order.code }}');
        expect(subject.toLowerCase()).toContain('gracias');
        expect(from).toContain('pedidos@patilandia.com.co');
    });

    it('emailVerificationHandler is no longer "Please verify your email address"', () => {
        const { subject, from } = subjectAndFromOf(emailVerificationHandler);
        expect(subject).not.toMatch(/please verify/i);
        expect(subject.toLowerCase()).toContain('confirm');
        expect(from).toContain('hola@patilandia.com.co');
    });

    it('passwordResetHandler is no longer "Forgotten password reset"', () => {
        const { subject, from } = subjectAndFromOf(passwordResetHandler);
        expect(subject).not.toMatch(/forgotten password/i);
        expect(subject.toLowerCase()).toContain('contraseña');
        expect(from).toContain('soporte@patilandia.com.co');
    });

    it('emailAddressChangeHandler is no longer "Please verify your change of email address"', () => {
        const { subject, from } = subjectAndFromOf(emailAddressChangeHandler);
        expect(subject).not.toMatch(/please verify/i);
        expect(subject.toLowerCase()).toContain('correo');
        expect(from).toContain('soporte@patilandia.com.co');
    });

    it('none of the four native handlers left an English subject behind', () => {
        const englishTells = /order confirmation|please verify|forgotten password|verify your/i;
        for (const handler of [
            orderConfirmationHandler,
            emailVerificationHandler,
            passwordResetHandler,
            emailAddressChangeHandler,
        ]) {
            expect(subjectAndFromOf(handler).subject).not.toMatch(englishTells);
        }
    });
});
