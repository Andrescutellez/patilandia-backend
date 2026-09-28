/**
 * Patilandia's own packing rule (explicit product decision, not something Mi Paquete's API dictates):
 * every order ships as exactly ONE physical package — however many products a shopper buys, they get
 * bundled, wrapped and strapped together into a single box before handing it to the carrier. This
 * turns a cart's real per-variant weight/length/width/height into the single set of numbers Mi
 * Paquete's /quoteShipping and /createSending expect.
 *
 * Formula (confirmed with the user 2026-09-27, deliberately conservative — never underestimates the
 * real footprint the way summing every dimension would overestimate it):
 *   - weight  = sum of every line's (variant weight × quantity)
 *   - length  = the largest single-item length among all lines (the base footprint)
 *   - width   = the largest single-item width among all lines
 *   - height  = sum of every line's (variant height × quantity) — items stacked and strapped
 *               together, not laid flat side by side
 *
 * Mi Paquete's own API requires whole-number kg/cm (mipaquete-api-v2.md section 4.3) and computes
 * volumetric/billed weight itself from these — this module never invents that math, it only rounds
 * up (Math.ceil) so a fractional real weight/dimension never under-quotes what a carrier would
 * actually charge.
 */

export interface PackableLine {
    weightKg: number;
    length: number;
    width: number;
    height: number;
    quantity: number;
}

export interface PackedParcel {
    weightKg: number;
    length: number;
    width: number;
    height: number;
}

export function packOrderLines(lines: PackableLine[]): PackedParcel {
    if (lines.length === 0) {
        return { weightKg: 0, length: 0, width: 0, height: 0 };
    }

    let totalWeightKg = 0;
    let maxLength = 0;
    let maxWidth = 0;
    let totalHeight = 0;

    for (const line of lines) {
        totalWeightKg += line.weightKg * line.quantity;
        maxLength = Math.max(maxLength, line.length);
        maxWidth = Math.max(maxWidth, line.width);
        totalHeight += line.height * line.quantity;
    }

    return {
        weightKg: Math.max(1, Math.ceil(totalWeightKg)),
        length: Math.max(1, Math.ceil(maxLength)),
        width: Math.max(1, Math.ceil(maxWidth)),
        height: Math.max(1, Math.ceil(totalHeight)),
    };
}
