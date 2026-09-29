import { describe, expect, it } from 'vitest';

import { resolveGoogleProductCategory } from './google-category-mapping';

describe('resolveGoogleProductCategory', () => {
    it('maps cat food to the real Google taxonomy path', () => {
        expect(resolveGoogleProductCategory('alimentos', 'cats')).toBe(
            'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Food',
        );
    });

    it('maps dog food to a different path than cat food', () => {
        expect(resolveGoogleProductCategory('alimentos', 'dogs')).toBe(
            'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Food',
        );
    });

    it('returns null when either code is missing', () => {
        expect(resolveGoogleProductCategory(null, 'cats')).toBeNull();
        expect(resolveGoogleProductCategory('alimentos', null)).toBeNull();
        expect(resolveGoogleProductCategory(null, null)).toBeNull();
    });

    it('returns null for a category that has no mapping entry yet', () => {
        expect(resolveGoogleProductCategory('camitas', 'cats')).toBeNull();
        expect(resolveGoogleProductCategory('juguetes', 'dogs')).toBeNull();
    });

    it('returns null for an unknown category code entirely', () => {
        expect(resolveGoogleProductCategory('no-existe', 'cats')).toBeNull();
    });
});
