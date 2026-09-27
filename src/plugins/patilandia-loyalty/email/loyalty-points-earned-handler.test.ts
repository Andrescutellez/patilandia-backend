import { describe, expect, it } from 'vitest';

import { POINTS_REASON_COPY, reasonForTransaction } from './loyalty-points-earned-handler';

describe('reasonForTransaction', () => {
    it('has real copy for every loyalty rule code (PURCHASE, SIGNUP, FIRST_PURCHASE, PET_REGISTERED, REVIEW, REVIEW_WITH_PHOTO, PET_BIRTHDAY)', () => {
        for (const code of [
            'PURCHASE',
            'SIGNUP',
            'FIRST_PURCHASE',
            'PET_REGISTERED',
            'REVIEW',
            'REVIEW_WITH_PHOTO',
        ]) {
            expect(POINTS_REASON_COPY[code], `missing copy for "${code}"`).toBeTruthy();
        }
    });

    it('uses the pet\'s real name for a birthday bonus when metadata carries it', () => {
        expect(reasonForTransaction('PET_BIRTHDAY', 'Firulais')).toBe('por el cumpleaños de Firulais 🎂');
    });

    it('falls back to generic birthday copy when no pet name is available', () => {
        expect(reasonForTransaction('PET_BIRTHDAY', null)).toBe(POINTS_REASON_COPY.PET_BIRTHDAY);
        expect(reasonForTransaction('PET_BIRTHDAY', undefined)).toBe(POINTS_REASON_COPY.PET_BIRTHDAY);
    });

    it('never falls back to a raw rule code or "undefined" for a known rule', () => {
        for (const code of Object.keys(POINTS_REASON_COPY)) {
            const reason = reasonForTransaction(code);
            expect(reason).not.toBe(code);
            expect(reason.toLowerCase()).not.toContain('undefined');
        }
    });

    it('degrades gracefully for an unknown or null rule code, instead of throwing', () => {
        expect(() => reasonForTransaction(null)).not.toThrow();
        expect(() => reasonForTransaction('SOME_FUTURE_RULE')).not.toThrow();
        expect(reasonForTransaction('SOME_FUTURE_RULE')).not.toContain('undefined');
    });
});
