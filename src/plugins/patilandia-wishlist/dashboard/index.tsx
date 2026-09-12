import {
    api,
    Button,
    defineDashboardExtension,
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
import { Heart, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface WishlistItem {
    id: string;
    createdAt: string;
    product: { id: string; name: string };
    customer: { firstName: string; lastName: string; emailAddress: string };
}

const WISHLIST_ITEMS_QUERY = gql`
    query PatilandiaWishlistItems {
        wishlistItems {
            id
            createdAt
            product {
                id
                name
            }
            customer {
                firstName
                lastName
                emailAddress
            }
        }
    }
`;

const DELETE_MUTATION = gql`
    mutation AdminRemoveWishlistItem($id: ID!) {
        adminRemoveWishlistItem(id: $id)
    }
`;

const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' });

function WishlistItemsPage() {
    const [items, setItems] = useState<WishlistItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        try {
            const result = await api.query<{ wishlistItems: WishlistItem[] }>(WISHLIST_ITEMS_QUERY);
            setItems(result.wishlistItems);
        } catch (err) {
            toast.error('No se pudo cargar la wishlist', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function remove(id: string) {
        if (!window.confirm('¿Quitar este producto de la wishlist del cliente?')) {
            return;
        }
        setPendingDeleteId(id);
        try {
            await api.mutate(DELETE_MUTATION, { id });
            toast.success('Producto quitado de la wishlist');
            await load();
        } catch (err) {
            toast.error('No se pudo quitar el producto', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setPendingDeleteId(null);
        }
    }

    return (
        <Page pageId="patilandia-wishlist">
            <PageTitle>Wishlist</PageTitle>
            <PageLayout>
                <PageBlock blockId="wishlist-table" column="main">
                    <div className="flex items-center justify-end mb-4">
                        <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}>
                            <RotateCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                            Actualizar
                        </Button>
                    </div>

                    {!loading && items.length === 0 && (
                        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
                            <Heart className="h-10 w-10" />
                            <p>Todavía nadie guardó un producto en su wishlist con un correo conocido.</p>
                        </div>
                    )}

                    {items.length > 0 && (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Desde</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium max-w-[220px] truncate">
                                            {item.product?.name ?? '—'}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span>
                                                    {item.customer.firstName} {item.customer.lastName}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {item.customer.emailAddress}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                            {dateFormatter.format(new Date(item.createdAt))}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                disabled={pendingDeleteId === item.id}
                                                onClick={() => remove(item.id)}
                                            >
                                                Quitar
                                            </Button>
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
            path: '/patilandia/wishlist',
            loader: () => ({ breadcrumb: 'Wishlist' }),
            navMenuItem: {
                id: 'wishlist',
                title: 'Wishlist',
                icon: Heart,
                sectionId: 'patilandia',
            },
            component: WishlistItemsPage,
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
