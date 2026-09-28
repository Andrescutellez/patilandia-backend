import { describe, expect, it } from 'vitest';

import { mapMipaqueteStateToFulfillmentState } from './mipaquete-state-map';

describe('mapMipaqueteStateToFulfillmentState', () => {
    it('maps the documented "Envío cancelado" to Cancelled', () => {
        expect(mapMipaqueteStateToFulfillmentState('Envío cancelado')).toBe('Cancelled');
    });

    it('maps "Distribución" to Shipped', () => {
        expect(mapMipaqueteStateToFulfillmentState('Distribución')).toBe('Shipped');
    });

    it('maps an "entregado" variant to Delivered', () => {
        expect(mapMipaqueteStateToFulfillmentState('Pedido entregado exitosamente')).toBe('Delivered');
    });

    it('returns null for pre-dispatch states that should not touch the Fulfillment', () => {
        expect(mapMipaqueteStateToFulfillmentState('Envío pendiente por pago')).toBeNull();
        expect(mapMipaqueteStateToFulfillmentState('Procesando tu envío')).toBeNull();
        expect(mapMipaqueteStateToFulfillmentState('Recolección programada')).toBeNull();
        expect(mapMipaqueteStateToFulfillmentState('Envío con novedad')).toBeNull();
    });

    it('is accent- and case-insensitive', () => {
        expect(mapMipaqueteStateToFulfillmentState('ENVIO CANCELADO')).toBe('Cancelled');
        expect(mapMipaqueteStateToFulfillmentState('entregado')).toBe('Delivered');
    });
});
