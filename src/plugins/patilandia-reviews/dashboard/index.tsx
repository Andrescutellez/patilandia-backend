import {
    api,
    Badge,
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
import { MessageSquareText, RotateCw, Star } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ReviewProduct {
    id: string;
    name: string;
}

interface ProductReview {
    id: string;
    createdAt: string;
    authorName: string;
    authorEmail: string;
    rating: number;
    title: string;
    body: string;
    approved: boolean;
    product: ReviewProduct;
}

const REVIEWS_QUERY = gql`
    query PatilandiaProductReviews($options: ProductReviewListOptions) {
        productReviews(options: $options) {
            items {
                id
                createdAt
                authorName
                authorEmail
                rating
                title
                body
                approved
                product {
                    id
                    name
                }
            }
            totalItems
        }
    }
`;

const APPROVE_MUTATION = gql`
    mutation ApproveProductReview($id: ID!) {
        approveProductReview(id: $id) {
            id
        }
    }
`;

const REJECT_MUTATION = gql`
    mutation RejectProductReview($id: ID!) {
        rejectProductReview(id: $id) {
            id
        }
    }
`;

const DELETE_MUTATION = gql`
    mutation DeleteProductReview($id: ID!) {
        deleteProductReview(id: $id)
    }
`;

type StatusFilter = 'pending' | 'approved' | 'all';

const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

function StarRating({ rating }: { rating: number }) {
    return (
        <span className="inline-flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
                <Star
                    key={i}
                    className={i < rating ? 'h-3.5 w-3.5 fill-amber-400 text-amber-400' : 'h-3.5 w-3.5 text-muted-foreground'}
                />
            ))}
        </span>
    );
}

function ReviewsPage() {
    const [reviews, setReviews] = useState<ProductReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingActionId, setPendingActionId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');

    async function load() {
        setLoading(true);
        try {
            const result = await api.query<{ productReviews: { items: ProductReview[]; totalItems: number } }>(
                REVIEWS_QUERY,
                { options: { take: 200, sort: { createdAt: 'DESC' } } },
            );
            setReviews(result.productReviews.items);
        } catch (err) {
            toast.error('No se pudieron cargar las reseñas', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function approve(id: string) {
        setPendingActionId(id);
        try {
            await api.mutate(APPROVE_MUTATION, { id });
            toast.success('Reseña aprobada y publicada');
            await load();
        } catch (err) {
            toast.error('No se pudo aprobar la reseña', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setPendingActionId(null);
        }
    }

    async function reject(id: string) {
        setPendingActionId(id);
        try {
            await api.mutate(REJECT_MUTATION, { id });
            toast.success('Reseña rechazada');
            await load();
        } catch (err) {
            toast.error('No se pudo rechazar la reseña', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setPendingActionId(null);
        }
    }

    async function remove(id: string) {
        if (!window.confirm('¿Eliminar esta reseña permanentemente? Esta acción no se puede deshacer.')) {
            return;
        }
        setPendingActionId(id);
        try {
            await api.mutate(DELETE_MUTATION, { id });
            toast.success('Reseña eliminada');
            await load();
        } catch (err) {
            toast.error('No se pudo eliminar la reseña', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setPendingActionId(null);
        }
    }

    const pendingCount = reviews.filter(r => !r.approved).length;
    const visible = reviews.filter(r => {
        if (statusFilter === 'pending') return !r.approved;
        if (statusFilter === 'approved') return r.approved;
        return true;
    });

    return (
        <Page pageId="patilandia-reviews">
            <PageTitle>Reseñas</PageTitle>
            <PageLayout>
                <PageBlock blockId="reviews-table" column="main">
                    <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-2">
                            {(
                                [
                                    ['pending', `Pendientes${pendingCount ? ` (${pendingCount})` : ''}`],
                                    ['approved', 'Publicadas'],
                                    ['all', 'Todas'],
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
                        <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}>
                            <RotateCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                            Actualizar
                        </Button>
                    </div>

                    {!loading && visible.length === 0 && (
                        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
                            <MessageSquareText className="h-10 w-10" />
                            <p>
                                {statusFilter === 'pending'
                                    ? 'No hay reseñas pendientes de moderación.'
                                    : 'No hay reseñas en esta vista.'}
                            </p>
                        </div>
                    )}

                    {visible.length > 0 && (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Autor</TableHead>
                                    <TableHead>Calificación</TableHead>
                                    <TableHead>Reseña</TableHead>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visible.map(review => (
                                    <TableRow key={review.id}>
                                        <TableCell className="font-medium max-w-[160px] truncate">
                                            {review.product?.name ?? '—'}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span>{review.authorName}</span>
                                                <span className="text-xs text-muted-foreground">{review.authorEmail}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <StarRating rating={review.rating} />
                                        </TableCell>
                                        <TableCell className="max-w-[320px]">
                                            {review.title && <div className="font-medium">{review.title}</div>}
                                            <div className="text-sm text-muted-foreground line-clamp-2">{review.body}</div>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                            {dateFormatter.format(new Date(review.createdAt))}
                                        </TableCell>
                                        <TableCell>
                                            {review.approved ? (
                                                <Badge variant="outline">Publicada</Badge>
                                            ) : (
                                                <Badge variant="secondary">Pendiente</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right space-x-2 whitespace-nowrap">
                                            {review.approved ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={pendingActionId === review.id}
                                                    onClick={() => reject(review.id)}
                                                >
                                                    Ocultar
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    disabled={pendingActionId === review.id}
                                                    onClick={() => approve(review.id)}
                                                >
                                                    Aprobar
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                disabled={pendingActionId === review.id}
                                                onClick={() => remove(review.id)}
                                            >
                                                Eliminar
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
            path: '/patilandia/resenas',
            loader: () => ({ breadcrumb: 'Reseñas' }),
            navMenuItem: {
                id: 'resenas',
                title: 'Reseñas',
                icon: MessageSquareText,
                sectionId: 'patilandia',
            },
            component: ReviewsPage,
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
