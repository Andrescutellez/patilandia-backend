import { describe, expect, it } from 'vitest';

import { NOTIFIABLE_STATES, STATE_COPY } from './order-state-change-handler';

describe('order-state-change NOTIFIABLE_STATES / STATE_COPY', () => {
    it('never includes PaymentSettled or PaymentAuthorized — those belong to order-confirmation, not here', () => {
        // The real bug this guards against: adding either back in would send a second,
        // redundant "your order is confirmed"-shaped email alongside orderConfirmationHandler's.
        expect(NOTIFIABLE_STATES).not.toContain('PaymentSettled');
        expect(NOTIFIABLE_STATES).not.toContain('PaymentAuthorized');
    });

    it('covers exactly the shipping/delivery/cancellation states, matching Vendure 3.7.3\'s default order process', () => {
        expect(NOTIFIABLE_STATES.sort()).toEqual(
            ['Cancelled', 'Delivered', 'PartiallyDelivered', 'PartiallyShipped', 'Shipped'].sort(),
        );
    });

    it('has real subject/heading/message copy for every notifiable state — no silent fallback', () => {
        for (const state of NOTIFIABLE_STATES) {
            const copy = STATE_COPY[state];
            expect(copy, `missing STATE_COPY for "${state}"`).toBeDefined();
            expect(copy!.subject.length).toBeGreaterThan(0);
            expect(copy!.heading.length).toBeGreaterThan(0);
            expect(copy!.message.length).toBeGreaterThan(0);
        }
    });

    it('every subject template interpolates the order code, so the customer can identify which order', () => {
        for (const state of NOTIFIABLE_STATES) {
            expect(STATE_COPY[state]!.subject).toContain('{{ order.code }}');
        }
    });
});
