export const PATILANDIA_PROCUREMENT_PLUGIN_OPTIONS = Symbol('PATILANDIA_PROCUREMENT_PLUGIN_OPTIONS');
export const loggerCtx = 'PatilandiaProcurementPlugin';

export type SourcingType = 'INVENTARIO_PROPIO' | 'DROPSHIPPING';
export const SOURCING_TYPES: SourcingType[] = ['INVENTARIO_PROPIO', 'DROPSHIPPING'];

export type PurchaseOrderStatus = 'BORRADOR' | 'ENVIADA' | 'PARCIALMENTE_RECIBIDA' | 'RECIBIDA';
export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = [
    'BORRADOR',
    'ENVIADA',
    'PARCIALMENTE_RECIBIDA',
    'RECIBIDA',
];
