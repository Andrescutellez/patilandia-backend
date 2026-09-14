import {
    api,
    Badge,
    Button,
    defineDashboardExtension,
    Input,
    Page,
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
import gql from 'graphql-tag';
import { RefreshCw, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SubscriptionCustomer {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
}

interface SubscriptionProduct {
    id: string;
    name: string;
}

interface SubscriptionVariant {
    id: string;
    name: string;
    product: SubscriptionProduct;
}

interface SubscriptionAddress {
    fullName: string;
    streetLine1: string;
    city: string;
}

interface ProductSubscription {
    id: string;
    quantity: number;
    frequencyDays: number;
    status: string;
    nextRenewalDate: string;
    customer: SubscriptionCustomer;
    productVariant: SubscriptionVariant;
    shippingAddress: SubscriptionAddress | null;
}

const SUBSCRIPTIONS_QUERY = gql`
    query PatilandiaSubscriptions($status: String, $search: String) {
        subscriptions(status: $status, search: $search) {
            id
            quantity
            frequencyDays
            status
            nextRenewalDate
            customer {
                id
                firstName
                lastName
                emailAddress
            }
            productVariant {
                id
                name
                product {
                    id
                    name
                }
            }
            shippingAddress {
                fullName
                streetLine1
                city
            }
        }
    }
`;

const CANCEL_MUTATION = gql`
    mutation CancelSubscriptionAdmin($id: ID!) {
        cancelSubscriptionAdmin(id: $id) {
            id
        }
    }
`;

type StatusFilter = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'ALL';

const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' });

const statusLabels: Record<string, string> = {
    ACTIVE: 'Activa',
    PAUSED: 'Pausada',
    CANCELLED: 'Cancelada',
};

function SubscriptionsPage() {
    const [subscriptions, setSubscriptions] = useState<ProductSubscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingActionId, setPendingActionId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
    const [search, setSearch] = useState('');

    async function load() {
        setLoading(true);
        try {
            const result = await api.query<{ subscriptions: ProductSubscription[] }>(SUBSCRIPTIONS_QUERY, {
                status: statusFilter === 'ALL' ? null : statusFilter,
                search: search.trim() || null,
            });
            setSubscriptions(result.subscriptions);
        } catch (err) {
            toast.error('No se pudieron cargar las suscripciones', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter]);

    async function cancel(id: string) {
        if (!window.confirm('¿Cancelar esta suscripción? El cliente no volverá a recibir recordatorios.')) {
            return;
        }
        setPendingActionId(id);
        try {
            await api.mutate(CANCEL_MUTATION, { id });
            toast.success('Suscripción cancelada');
            await load();
        } catch (err) {
            toast.error('No se pudo cancelar la suscripción', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setPendingActionId(null);
        }
    }

    return (
        <Page pageId="patilandia-subscriptions">
            <PageTitle>Suscripciones</PageTitle>
            <PageLayout>
                <PageBlock blockId="subscriptions-table" column="main">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-2">
                            {(
                                [
                                    ['ACTIVE', 'Activas'],
                                    ['PAUSED', 'Pausadas'],
                                    ['CANCELLED', 'Canceladas'],
                                    ['ALL', 'Todas'],
                                ] as [StatusFilter, string][]
                            ).map(([value, label]) => (
                                <Button
                                    key={value}
                                    size="sm"
                                    variant={statusFilter === value ? 'default' : 'outline'}
                                    onClick={() => setStatusFilter(value)}
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <Input
                                className="w-64"
                                placeholder="Buscar por cliente o producto"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && load()}
                            />
                            <Button size="sm" variant="outline" onClick={() => load()}>
                                Buscar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}>
                                <RotateCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                            </Button>
                        </div>
                    </div>

                    {!loading && subscriptions.length === 0 && (
                        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
                            <RefreshCw className="h-10 w-10" />
                            <p>No hay suscripciones en esta vista.</p>
                        </div>
                    )}

                    {subscriptions.length > 0 && (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Cantidad</TableHead>
                                    <TableHead>Frecuencia</TableHead>
                                    <TableHead>Próxima fecha</TableHead>
                                    <TableHead>Dirección</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {subscriptions.map(subscription => (
                                    <TableRow key={subscription.id}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span>
                                                    {subscription.customer.firstName} {subscription.customer.lastName}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {subscription.customer.emailAddress}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="max-w-[200px] truncate">
                                            {subscription.productVariant.product.name}
                                            <span className="block text-xs text-muted-foreground">
                                                {subscription.productVariant.name}
                                            </span>
                                        </TableCell>
                                        <TableCell>{subscription.quantity}</TableCell>
                                        <TableCell>cada {subscription.frequencyDays} días</TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {dateFormatter.format(new Date(subscription.nextRenewalDate))}
                                        </TableCell>
                                        <TableCell className="max-w-[220px] truncate">
                                            {subscription.shippingAddress
                                                ? `${subscription.shippingAddress.fullName} — ${subscription.shippingAddress.streetLine1}, ${subscription.shippingAddress.city}`
                                                : '—'}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={subscription.status === 'ACTIVE' ? 'default' : 'outline'}>
                                                {statusLabels[subscription.status] ?? subscription.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {subscription.status !== 'CANCELLED' ? (
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    disabled={pendingActionId === subscription.id}
                                                    onClick={() => cancel(subscription.id)}
                                                >
                                                    Cancelar
                                                </Button>
                                            ) : null}
                                        </TableCell>
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

defineDashboardExtension({
    routes: [
        {
            path: '/patilandia/suscripciones',
            loader: () => ({ breadcrumb: 'Suscripciones' }),
            navMenuItem: {
                id: 'suscripciones',
                title: 'Suscripciones',
                icon: RefreshCw,
                sectionId: 'patilandia',
            },
            component: SubscriptionsPage,
        },
    ],
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
