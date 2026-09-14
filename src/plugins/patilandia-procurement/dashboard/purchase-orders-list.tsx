import {
    api,
    Badge,
    Button,
    Page,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    toast,
} from '@vendure/dashboard';
import { Link } from '@tanstack/react-router';
import { ClipboardList, PlusIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { purchaseOrderListQuery } from './purchase-orders.graphql';

interface PurchaseOrderRow {
    id: string;
    status: string;
    orderDate: string;
    totalMinorUnits: number;
    supplier: { id: string; name: string };
}

const STATUS_VARIANTS: Record<string, 'default' | 'outline' | 'secondary'> = {
    BORRADOR: 'outline',
    ENVIADA: 'secondary',
    PARCIALMENTE_RECIBIDA: 'secondary',
    RECIBIDA: 'default',
};

const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' });

function PurchaseOrdersListPage() {
    const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api
            .query<{ purchaseOrders: { items: PurchaseOrderRow[] } }>(purchaseOrderListQuery)
            .then(result => setOrders(result.purchaseOrders.items))
            .catch(err => {
                toast.error('No se pudieron cargar las órdenes de compra', { description: err instanceof Error ? err.message : undefined });
            })
            .finally(() => setLoading(false));
    }, []);

    return (
        <Page pageId="patilandia-purchase-order-list">
            <PageTitle>Órdenes de compra</PageTitle>
            <PageActionBarRight>
                <Button render={<Link to="/patilandia/ordenes-compra/new" />}>
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Nueva orden
                </Button>
            </PageActionBarRight>
            <PageLayout>
                <PageBlock column="main" blockId="purchase-orders-table">
                    {!loading && orders.length === 0 ? (
                        <p className="py-10 text-center text-sm text-muted-foreground">Todavía no hay órdenes de compra.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Orden</TableHead>
                                    <TableHead>Proveedor</TableHead>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead>Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.map(order => (
                                    <TableRow key={order.id}>
                                        <TableCell>
                                            <Link
                                                className="font-medium text-primary hover:underline"
                                                to={`/patilandia/ordenes-compra/${order.id}`}
                                            >
                                                #{order.id}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{order.supplier?.name ?? '—'}</TableCell>
                                        <TableCell>{dateFormatter.format(new Date(order.orderDate))}</TableCell>
                                        <TableCell>
                                            <Badge variant={STATUS_VARIANTS[order.status] ?? 'outline'}>{order.status}</Badge>
                                        </TableCell>
                                        <TableCell>${(order.totalMinorUnits / 100).toLocaleString('es-CO')}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </PageBlock>
            </PageLayout>
        </Page>
    );
}

export const purchaseOrdersRoute = {
    path: '/patilandia/ordenes-compra',
    loader: () => ({ breadcrumb: 'Órdenes de compra' }),
    navMenuItem: {
        id: 'ordenes-compra',
        title: 'Órdenes de compra',
        icon: ClipboardList,
        sectionId: 'patilandia',
    },
    component: PurchaseOrdersListPage,
};
