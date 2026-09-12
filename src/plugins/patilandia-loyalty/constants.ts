export const PATILANDIA_LOYALTY_PLUGIN_OPTIONS = Symbol('PATILANDIA_LOYALTY_PLUGIN_OPTIONS');
export const loggerCtx = 'PatilandiaLoyaltyPlugin';

export const LOYALTY_VERIFICATION_TOKEN_TTL_MINUTES = 30;
export const LOYALTY_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;

/** PaymentMethod.code for contraentrega — see event-subscribers.ts for why this matters: unlike a
 *  prepaid method, reaching PaymentAuthorized on a cash-on-delivery order doesn't mean money has
 *  actually changed hands yet, so PURCHASE/FIRST_PURCHASE are deferred to the order's `Delivered`
 *  transition instead. Created by src/scripts/configure-checkout.ts. */
export const CASH_ON_DELIVERY_PAYMENT_METHOD_CODE = 'cash-on-delivery';

/** Default economy seeded once on bootstrap if the LoyaltyRule table is empty — see
 *  LoyaltyService.seedDefaultsIfEmpty(). Admin-editable after that; never read directly again. */
export const DEFAULT_LOYALTY_RULES = [
    {
        code: 'PURCHASE',
        label: 'Puntos por compra',
        kind: 'PER_CURRENCY_UNIT' as const,
        currencyMinorUnitsPerPoint: 50000, // $500 COP
        points: null,
        description: '1 Patipunto por cada $500 COP del subtotal de productos (sin envío ni impuesto).',
    },
    {
        code: 'SIGNUP',
        label: 'Crear cuenta',
        kind: 'FLAT' as const,
        points: 100,
        currencyMinorUnitsPerPoint: null,
        description: 'Bono único la primera vez que un correo nuevo se identifica en Patilandia.',
    },
    {
        code: 'FIRST_PURCHASE',
        label: 'Primera compra',
        kind: 'FLAT' as const,
        points: 200,
        currencyMinorUnitsPerPoint: null,
        description: 'Bono único en el primer pedido que llega a PaymentAuthorized.',
    },
    {
        code: 'PET_REGISTERED',
        label: 'Registrar una mascota',
        kind: 'FLAT' as const,
        points: 50,
        currencyMinorUnitsPerPoint: null,
        description: 'Por cada mascota nueva registrada en /cuenta/mascotas.',
    },
    {
        code: 'REVIEW',
        label: 'Dejar una reseña',
        kind: 'FLAT' as const,
        points: 50,
        currencyMinorUnitsPerPoint: null,
        description: 'Al aprobarse una reseña de producto.',
    },
    {
        code: 'REVIEW_WITH_PHOTO',
        label: 'Reseña con fotografía',
        kind: 'FLAT' as const,
        points: 100,
        currencyMinorUnitsPerPoint: null,
        description:
            'Reservado para cuando las reseñas soporten adjuntar una foto — ProductReview no tiene ese campo todavía, así que esta regla no se dispara desde ningún lado hoy.',
    },
    {
        code: 'PET_BIRTHDAY',
        label: 'Cumpleaños de la mascota',
        kind: 'FLAT' as const,
        points: 100,
        currencyMinorUnitsPerPoint: null,
        description: 'Bono anual, otorgado por la tarea programada diaria de cumpleaños.',
    },
];
