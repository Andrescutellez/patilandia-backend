import { describe, expect, it } from 'vitest';

import { packOrderLines } from './packing';

describe('packOrderLines', () => {
    it('returns an empty parcel for no lines', () => {
        expect(packOrderLines([])).toEqual({ weightKg: 0, length: 0, width: 0, height: 0 });
    });

    it('packs a single product/quantity as itself, rounded up', () => {
        const result = packOrderLines([{ weightKg: 2.2, length: 30, width: 20, height: 15, quantity: 1 }]);
        expect(result).toEqual({ weightKg: 3, length: 30, width: 20, height: 15 });
    });

    it('multiplies weight and height by quantity for a single repeated line', () => {
        const result = packOrderLines([{ weightKg: 1, length: 10, width: 10, height: 5, quantity: 3 }]);
        expect(result).toEqual({ weightKg: 3, length: 10, width: 10, height: 15 });
    });

    it('combines camita + cojín + juguete into one box: max footprint, summed height and weight', () => {
        const result = packOrderLines([
            { weightKg: 2.5, length: 40, width: 35, height: 12, quantity: 1 }, // camita
            { weightKg: 1, length: 30, width: 30, height: 8, quantity: 1 }, // cojín
            { weightKg: 0.3, length: 15, width: 10, height: 5, quantity: 2 }, // juguete x2
        ]);
        expect(result).toEqual({
            weightKg: Math.ceil(2.5 + 1 + 0.3 * 2), // 4.1 -> 5
            length: 40, // largest single item
            width: 35, // largest single item
            height: Math.ceil(12 + 8 + 5 * 2), // stacked+strapped -> 30
        });
    });

    it('never returns zero for a non-empty order, even with tiny real values', () => {
        const result = packOrderLines([{ weightKg: 0.01, length: 0.2, width: 0.2, height: 0.2, quantity: 1 }]);
        expect(result.weightKg).toBeGreaterThanOrEqual(1);
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result.width).toBeGreaterThanOrEqual(1);
        expect(result.height).toBeGreaterThanOrEqual(1);
    });
});
