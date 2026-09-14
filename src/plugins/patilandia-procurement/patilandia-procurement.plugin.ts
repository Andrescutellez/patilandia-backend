import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';

import { adminApiExtensions } from './api/api-extensions';
import { PurchaseOrderAdminResolver, PurchaseOrderEntityResolver, PurchaseOrderLineEntityResolver } from './api/purchase-order-admin.resolver';
import { SupplierAdminResolver } from './api/supplier-admin.resolver';
import { PATILANDIA_PROCUREMENT_PLUGIN_OPTIONS } from './constants';
import { GoodsReceiptLine } from './entities/goods-receipt-line.entity';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { PurchaseOrderLine } from './entities/purchase-order-line.entity';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { SupplierProductVariant } from './entities/supplier-product-variant.entity';
import { Supplier } from './entities/supplier.entity';
import { PurchaseOrderService } from './services/purchase-order.service';
import { SupplierService } from './services/supplier.service';
import { PluginInitOptions } from './types';

/**
 * 100% back-office — Proveedores (Suppliers) and Órdenes de Compra (Purchase Orders). Nothing here
 * is exposed to the Shop API; no customer-facing feature depends on this plugin. See
 * PurchaseOrderService's doc comment for the one delicate piece: safely bumping real Vendure stock
 * (StockLevel) when a receipt is registered, without the lost-update race Vendure's own
 * StockLevelService.updateStockOnHandForLocation has.
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [
        { provide: PATILANDIA_PROCUREMENT_PLUGIN_OPTIONS, useFactory: () => PatilandiaProcurementPlugin.options },
        SupplierService,
        PurchaseOrderService,
    ],
    configuration: config => config,
    compatibility: '^3.0.0',
    entities: [Supplier, SupplierProductVariant, PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [SupplierAdminResolver, PurchaseOrderAdminResolver, PurchaseOrderEntityResolver, PurchaseOrderLineEntityResolver],
    },
    dashboard: './dashboard/index.tsx',
})
export class PatilandiaProcurementPlugin {
    static options: PluginInitOptions;

    static init(options: PluginInitOptions): Type<PatilandiaProcurementPlugin> {
        this.options = options;
        return PatilandiaProcurementPlugin;
    }
}
