import {
    api,
    Badge,
    defineDashboardExtension,
    Page,
    PageBlock,
    PageLayout,
    PageTitle,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    toast,
} from '@vendure/dashboard';
import gql from 'graphql-tag';
import { Rss } from 'lucide-react';
import { useEffect, useState } from 'react';

interface FeedsProductCustomFields {
    includeInFeed: boolean;
    adsEligible: boolean;
}

interface FeedsProduct {
    id: string;
    name: string;
    enabled: boolean;
    customFields: FeedsProductCustomFields;
}

type FeedsToggleField = keyof FeedsProductCustomFields;

const PRODUCT_LIST_QUERY = gql`
    query PatilandiaFeedsProductList {
        products(options: { take: 100, sort: { name: ASC } }) {
            totalItems
            items {
                id
                name
                enabled
                customFields {
                    includeInFeed
                    adsEligible
                }
            }
        }
    }
`;

// Two separate mutation documents on purpose — each selects only its own customField inside the
// inline `customFields: {...}` literal, so the other field is never part of what's sent and can
// never be accidentally overwritten by a toggle on the other column.
const SET_INCLUDE_IN_FEED_MUTATION = gql`
    mutation PatilandiaFeedsSetIncludeInFeed($id: ID!, $value: Boolean!) {
        updateProduct(input: { id: $id, customFields: { includeInFeed: $value } }) {
            id
            customFields {
                includeInFeed
            }
        }
    }
`;

const SET_ADS_ELIGIBLE_MUTATION = gql`
    mutation PatilandiaFeedsSetAdsEligible($id: ID!, $value: Boolean!) {
        updateProduct(input: { id: $id, customFields: { adsEligible: $value } }) {
            id
            customFields {
                adsEligible
            }
        }
    }
`;

const FIELD_MUTATIONS: Record<FeedsToggleField, typeof SET_INCLUDE_IN_FEED_MUTATION> = {
    includeInFeed: SET_INCLUDE_IN_FEED_MUTATION,
    adsEligible: SET_ADS_ELIGIBLE_MUTATION,
};

function AdsEligibilityTab() {
    const [products, setProducts] = useState<FeedsProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState<string | null>(null);

    useEffect(() => {
        api.query<{ products: { totalItems: number; items: FeedsProduct[] } }>(PRODUCT_LIST_QUERY)
            .then(result => setProducts(result.products.items))
            .catch(err => toast.error('No se pudo cargar el catálogo', { description: err instanceof Error ? err.message : undefined }))
            .finally(() => setLoading(false));
    }, []);

    async function toggle(product: FeedsProduct, field: FeedsToggleField, checked: boolean) {
        const key = `${product.id}:${field}`;
        setSavingKey(key);
        try {
            await api.mutate(FIELD_MUTATIONS[field], { id: product.id, value: checked });
            setProducts(prev =>
                prev.map(p => (p.id === product.id ? { ...p, customFields: { ...p.customFields, [field]: checked } } : p)),
            );
        } catch (err) {
            toast.error('No se pudo guardar', { description: err instanceof Error ? err.message : undefined });
        } finally {
            setSavingKey(null);
        }
    }

    if (loading) return null;

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                "Incluir en feed" decide si el producto entra a Google Free Listings (gratis). "Pautar en Ads" decide
                si además entra en campañas pagas (ej. los que dejan buen margen) — solo tiene efecto si también está
                incluido en el feed. Ninguno de los dos afecta si el producto se vende en la tienda propia.
            </p>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Incluir en feed</TableHead>
                        <TableHead>Pautar en Ads</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {products.map(product => (
                        <TableRow key={product.id}>
                            <TableCell>{product.name}</TableCell>
                            <TableCell>
                                <Badge variant={product.enabled ? 'outline' : 'destructive'}>
                                    {product.enabled ? 'Publicado' : 'Deshabilitado'}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <Switch
                                    checked={product.customFields.includeInFeed}
                                    disabled={savingKey === `${product.id}:includeInFeed`}
                                    onCheckedChange={checked => toggle(product, 'includeInFeed', checked)}
                                />
                            </TableCell>
                            <TableCell>
                                <Switch
                                    checked={product.customFields.adsEligible}
                                    disabled={savingKey === `${product.id}:adsEligible`}
                                    onCheckedChange={checked => toggle(product, 'adsEligible', checked)}
                                />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function PatilandiaFeedsPage() {
    return (
        <Page pageId="patilandia-feeds">
            <PageTitle>Feeds de producto</PageTitle>
            <PageLayout>
                <PageBlock blockId="feeds-ads-eligibility" column="main">
                    <AdsEligibilityTab />
                </PageBlock>
            </PageLayout>
        </Page>
    );
}

defineDashboardExtension({
    routes: [
        {
            path: '/patilandia/feeds',
            loader: () => ({ breadcrumb: 'Feeds' }),
            navMenuItem: {
                id: 'feeds',
                title: 'Feeds',
                icon: Rss,
                sectionId: 'patilandia',
            },
            component: PatilandiaFeedsPage,
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
