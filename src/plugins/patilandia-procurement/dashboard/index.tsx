import { defineDashboardExtension } from '@vendure/dashboard';

import { purchaseOrderDetailRoute } from './purchase-orders-detail';
import { purchaseOrdersRoute } from './purchase-orders-list';
import { supplierDetailRoute } from './suppliers-detail';
import { suppliersRoute } from './suppliers-list';

defineDashboardExtension({
    routes: [suppliersRoute, supplierDetailRoute, purchaseOrdersRoute, purchaseOrderDetailRoute],
    pageBlocks: [],
    navSections: [],
    actionBarItems: [],
    alerts: [],
    widgets: [],
    customFormComponents: {},
    dataTables: [],
    detailForms: [],
    login: {},
    historyEntries: [],
});
