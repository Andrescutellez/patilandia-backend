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
import { Package, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface MipaqueteSettings {
    id: string;
    bogotaOwnShippingEnabled: boolean;
    bogotaOwnShippingCostMinorUnits: number;
}

interface MipaqueteShipment {
    id: string;
    createdAt: string;
    order: { code: string };
    state: string;
    mpCode: number | null;
    deliveryCompanyName: string | null;
    shippingCostMinorUnits: number;
    trackingCode: string | null;
    pickupCode: string | null;
    lastError: string | null;
}

interface IncompleteVariant {
    id: string;
    sku: string;
    name: string;
    product: { name: string };
}

const SETTINGS_QUERY = gql`
    query MipaqueteSettings {
        mipaqueteSettings {
            id
            bogotaOwnShippingEnabled
            bogotaOwnShippingCostMinorUnits
        }
    }
`;

const UPDATE_SETTINGS_MUTATION = gql`
    mutation UpdateMipaqueteSettings($input: UpdateMipaqueteSettingsInput!) {
        updateMipaqueteSettings(input: $input) {
            id
            bogotaOwnShippingEnabled
            bogotaOwnShippingCostMinorUnits
        }
    }
`;

const SHIPMENTS_QUERY = gql`
    query MipaqueteShipments {
        mipaqueteShipments {
            id
            createdAt
            order {
                code
            }
            state
            mpCode
            deliveryCompanyName
            shippingCostMinorUnits
            trackingCode
            pickupCode
            lastError
        }
    }
`;

const INCOMPLETE_VARIANTS_QUERY = gql`
    query MipaqueteIncompleteVariants {
        mipaqueteIncompleteVariants {
            id
            sku
            name
            product {
                name
            }
        }
    }
`;

const currencyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

function minorToCurrency(minorUnits: number): string {
    return currencyFormatter.format(minorUnits / 100);
}

function currencyToMinor(pesos: number): number {
    return Math.round(pesos * 100);
}

const STATE_LABEL: Record<string, string> = {
    CREATED: 'Creado',
    FAILED: 'Falló',
    CANCELLED: 'Cancelado',
    PENDING: 'Pendiente',
};

function IncompleteVariantsAlert() {
    const [variants, setVariants] = useState<IncompleteVariant[]>([]);

    useEffect(() => {
        api.query<{ mipaqueteIncompleteVariants: IncompleteVariant[] }>(INCOMPLETE_VARIANTS_QUERY)
            .then(result => setVariants(result.mipaqueteIncompleteVariants))
            .catch(() => {
                // Silent — this is an informational banner, not a page the admin depends on to work.
            });
    }, []);

    if (variants.length === 0) return null;

    return (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <p className="font-medium">⚠️ {variants.length} variante(s) con datos de envío incompletos</p>
            <p className="mt-1 text-sm">
                Todavía tienen el valor de referencia (10cm) en largo, ancho o alto, o no tienen peso — Mi Paquete
                cotizará con esos números hasta que se corrijan desde el producto.
            </p>
            <ul className="mt-2 space-y-1 text-sm">
                {variants.slice(0, 20).map(v => (
                    <li key={v.id}>
                        {v.product.name} — {v.name} ({v.sku})
                    </li>
                ))}
            </ul>
        </div>
    );
}

function SettingsTab() {
    const [settings, setSettings] = useState<MipaqueteSettings | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.query<{ mipaqueteSettings: MipaqueteSettings }>(SETTINGS_QUERY).then(result => setSettings(result.mipaqueteSettings));
    }, []);

    async function save(patch: Partial<Pick<MipaqueteSettings, 'bogotaOwnShippingEnabled' | 'bogotaOwnShippingCostMinorUnits'>>) {
        if (!settings) return;
        setSaving(true);
        try {
            const result = await api.mutate<{ updateMipaqueteSettings: MipaqueteSettings }>(UPDATE_SETTINGS_MUTATION, {
                input: patch,
            });
            setSettings(result.updateMipaqueteSettings);
            toast.success('Configuración guardada');
        } catch (err) {
            toast.error('No se pudo guardar', { description: err instanceof Error ? err.message : undefined });
        } finally {
            setSaving(false);
        }
    }

    if (!settings) return null;

    return (
        <div className="max-w-md space-y-6">
            <IncompleteVariantsAlert />

            <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                    <p className="font-medium">Envío propio en Bogotá</p>
                    <p className="text-sm text-muted-foreground">
                        Si está activado, los pedidos con destino Bogotá usan este envío propio en vez de Mi Paquete.
                    </p>
                </div>
                <Switch
                    checked={settings.bogotaOwnShippingEnabled}
                    disabled={saving}
                    onCheckedChange={checked => save({ bogotaOwnShippingEnabled: checked })}
                />
            </div>

            {settings.bogotaOwnShippingEnabled && (
                <div>
                    <label className="text-sm font-medium">Costo del envío propio en Bogotá (en pesos, 0 = gratis)</label>
                    <Input
                        type="number"
                        defaultValue={settings.bogotaOwnShippingCostMinorUnits / 100}
                        disabled={saving}
                        onBlur={e => {
                            const value = currencyToMinor(Number(e.target.value));
                            if (value !== settings.bogotaOwnShippingCostMinorUnits) {
                                save({ bogotaOwnShippingCostMinorUnits: value });
                            }
                        }}
                    />
                </div>
            )}
        </div>
    );
}

function ShipmentsTab() {
    const [shipments, setShipments] = useState<MipaqueteShipment[]>([]);
    const [loading, setLoading] = useState(true);

    async function load() {
        setLoading(true);
        try {
            const result = await api.query<{ mipaqueteShipments: MipaqueteShipment[] }>(SHIPMENTS_QUERY);
            setShipments(result.mipaqueteShipments);
        } catch (err) {
            toast.error('No se pudieron cargar los envíos', { description: err instanceof Error ? err.message : undefined });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-end">
                <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}>
                    <RotateCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                    Actualizar
                </Button>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Pedido</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Transportadora</TableHead>
                        <TableHead>Costo</TableHead>
                        <TableHead>mpCode / guía</TableHead>
                        <TableHead>Fecha</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {shipments.map(s => (
                        <TableRow key={s.id}>
                            <TableCell>{s.order.code}</TableCell>
                            <TableCell>
                                <Badge variant={s.state === 'FAILED' ? 'destructive' : 'outline'}>
                                    {STATE_LABEL[s.state] ?? s.state}
                                </Badge>
                                {s.lastError ? <p className="mt-1 text-xs text-red-600">{s.lastError}</p> : null}
                            </TableCell>
                            <TableCell>{s.deliveryCompanyName ?? '—'}</TableCell>
                            <TableCell>{minorToCurrency(s.shippingCostMinorUnits)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                                {s.mpCode ?? '—'} {s.trackingCode ? `/ ${s.trackingCode}` : ''}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                {dateFormatter.format(new Date(s.createdAt))}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

type Tab = 'settings' | 'shipments';

function MipaquetePage() {
    const [tab, setTab] = useState<Tab>('settings');

    return (
        <Page pageId="patilandia-mipaquete">
            <PageTitle>Mi Paquete</PageTitle>
            <PageLayout>
                <PageBlock blockId="mipaquete-tabs" column="main">
                    <div className="mb-4 flex items-center gap-2">
                        {(
                            [
                                ['settings', 'Configuración'],
                                ['shipments', 'Envíos'],
                            ] as [Tab, string][]
                        ).map(([value, label]) => (
                            <Button key={value} size="sm" variant={tab === value ? 'default' : 'outline'} onClick={() => setTab(value)}>
                                {label}
                            </Button>
                        ))}
                    </div>
                    {tab === 'settings' && <SettingsTab />}
                    {tab === 'shipments' && <ShipmentsTab />}
                </PageBlock>
            </PageLayout>
        </Page>
    );
}

defineDashboardExtension({
    routes: [
        {
            path: '/patilandia/mi-paquete',
            loader: () => ({ breadcrumb: 'Mi Paquete' }),
            navMenuItem: {
                id: 'mipaquete',
                title: 'Mi Paquete',
                icon: Package,
                sectionId: 'patilandia',
            },
            component: MipaquetePage,
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
