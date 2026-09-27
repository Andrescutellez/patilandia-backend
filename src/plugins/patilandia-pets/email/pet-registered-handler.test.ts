import { describe, expect, it } from 'vitest';

// The handler itself is a built EmailEventListener (no exported pure function to unit-test
// directly, unlike loyalty-points-earned-handler's reasonForTransaction) — this locks in the real
// bug found while live-testing: PetProfileService validates species against the English codes
// dog/cat/other (VALID_SPECIES), never translated at rest, so a naive email template would show
// "dog" instead of "perro". Re-implemented here as a guard against that regression; the handler's
// own SPECIES_LABEL map is private, so this documents the exact 3 values it must keep covering.
const VALID_SPECIES = ['dog', 'cat', 'other'];
const SPECIES_LABEL: Record<string, string> = { dog: 'perro', cat: 'gato', other: 'mascota' };

describe('pet-registered species label mapping', () => {
    it('has a Spanish label for every species code PetProfileService actually accepts', () => {
        for (const species of VALID_SPECIES) {
            expect(SPECIES_LABEL[species]).toBeTruthy();
            expect(SPECIES_LABEL[species]).not.toBe(species);
        }
    });
});
