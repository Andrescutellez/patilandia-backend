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

interface FeedsProduct {
    id: string;
    name: string;
    enabled: boolean;
    customFields: {
        adsEligible: boolean;
    };
}

const PRODUCT_LIST_QUERY = gql`
    query PatilandiaFeedsProductList {
        products(options: { take: 100, sort: { name: ASC } }) {
            totalItems
            items {
                id
                name
                enabled
                customFields {
                    adsEligible
                }
            }
        }
    }
`;

const SET_ADS_ELIGIBLE_MUTATION = gql`
    mutation PatilandiaFeedsSetAdsEligible($id: ID!, $adsEligible: Boolean!) {
        updateProduct(input: { id: $id, customFields: { adsEligible: $adsEligible } }) {
            id
            customFields {
                adsEligible
            }
        }
    }
`;

function AdsEligibilityTab() {
    const [products, setProducts] = useState<FeedsProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);

    useEffect(() => {
        api.query<{ products: { totalItems: number; items: FeedsProduct[] } }>(PRODUCT_LIST_QUERY)
            .then(result => setProducts(result.products.items))
            .catch(err => toast.error('No se pudo cargar el catálogo', { description: err instanceof Error ? err.message : undefined }))
            .finally(() => setLoading(false));
    }, []);

    async function toggle(product: FeedsProduct, checked: boolean) {
        setSavingId(product.id);
        try {
            await api.mutate(SET_ADS_ELIGIBLE_MUTATION, { id: product.id, adsEligible: checked });
            setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, customFields: { adsEligible: checked } } : p)));
        } catch (err) {
            toast.error('No se pudo guardar', { description: err instanceof Error ? err.message : undefined });
        } finally {
            setSavingId(null);
        }
    }

    if (loading) return null;

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Marcá qué productos entran en campañas pagas de Google/Meta Ads (ej. los que dejan buen margen). No
                afecta si el producto aparece gratis en Google Free Listings — eso depende solo de estar publicado,
                no de esta marca.
            </p>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Estado</TableHead>
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
                                    checked={product.customFields.adsEligible}
                                    disabled={savingId === product.id}
                                    onCheckedChange={checked => toggle(product, checked)}
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
