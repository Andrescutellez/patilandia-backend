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

type ShippingSubsidyMode = 'NONE' | 'PERCENTAGE' | 'FIXED';

interface MipaqueteSettings {
    id: string;
    bogotaOwnShippingEnabled: boolean;
    bogotaOwnShippingCostMinorUnits: number;
    automaticGuideEnabled: boolean;
    shippingSubsidyMode: ShippingSubsidyMode;
    shippingSubsidyPercentage: number;
    shippingSubsidyFixedMinorUnits: number;
    freeShippingThresholdEnabled: boolean;
    freeShippingThresholdMinorUnits: number;
    bogotaFreeShippingThresholdEnabled: boolean;
    bogotaFreeShippingThresholdMinorUnits: number;
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
            automaticGuideEnabled
            shippingSubsidyMode
            shippingSubsidyPercentage
            shippingSubsidyFixedMinorUnits
            freeShippingThresholdEnabled
            freeShippingThresholdMinorUnits
            bogotaFreeShippingThresholdEnabled
            bogotaFreeShippingThresholdMinorUnits
        }
    }
`;

const UPDATE_SETTINGS_MUTATION = gql`
    mutation UpdateMipaqueteSettings($input: UpdateMipaqueteSettingsInput!) {
        updateMipaqueteSettings(input: $input) {
            id
            bogotaOwnShippingEnabled
            bogotaOwnShippingCostMinorUnits
            automaticGuideEnabled
            shippingSubsidyMode
            shippingSubsidyPercentage
            shippingSubsidyFixedMinorUnits
            freeShippingThresholdEnabled
            freeShippingThresholdMinorUnits
            bogotaFreeShippingThresholdEnabled
            bogotaFreeShippingThresholdMinorUnits
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

    async function save(patch: Partial<Omit<MipaqueteSettings, 'id'>>) {
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
                    <p className="font-medium">Guía automática con Mi Paquete</p>
                    <p className="text-sm text-muted-foreground">
                        Si está desactivada, el checkout sigue cotizando en tiempo real con Mi Paquete, pero al
                        pagarse un pedido no se crea el envío real ni la guía automáticamente — hay que crearla a
                        mano en Mi Paquete y hacer el fulfillment manual desde Vendure.
                    </p>
                </div>
                <Switch
                    checked={settings.automaticGuideEnabled}
                    disabled={saving}
                    onCheckedChange={checked => save({ automaticGuideEnabled: checked })}
                />
            </div>

            <div className="space-y-3 rounded-lg border p-4">
                <div>
                    <p className="font-medium">Subsidio de envío (Mi Paquete)</p>
                    <p className="text-sm text-muted-foreground">
                        Cuánto de la tarifa real cotizada con Mi Paquete asume Patilandia. El cliente sigue viendo el
                        precio ya rebajado en el checkout — lo que Mi Paquete le cobra a Patilandia por crear el
                        envío no cambia.
                    </p>
                </div>
                <div className="flex gap-2">
                    {(
                        [
                            ['NONE', 'Ninguno'],
                            ['PERCENTAGE', 'Porcentaje'],
                            ['FIXED', 'Monto fijo'],
                        ] as [ShippingSubsidyMode, string][]
                    ).map(([mode, label]) => (
                        <Button
                            key={mode}
                            disabled={saving}
                            onClick={() => save({ shippingSubsidyMode: mode })}
                            size="sm"
                            type="button"
                            variant={settings.shippingSubsidyMode === mode ? 'default' : 'outline'}
                        >
                            {label}
                        </Button>
                    ))}
                </div>
                {settings.shippingSubsidyMode === 'PERCENTAGE' && (
                    <label className="grid gap-2">
                        <span className="text-sm font-medium">% del envío que asume Patilandia</span>
                        <Input
                            type="number"
                            min={0}
                            max={100}
                            defaultValue={settings.shippingSubsidyPercentage}
                            disabled={saving}
                            onBlur={e => {
                                const value = Number(e.target.value);
                                if (value !== settings.shippingSubsidyPercentage) {
                                    save({ shippingSubsidyPercentage: value });
                                }
                            }}
                        />
                    </label>
                )}
                {settings.shippingSubsidyMode === 'FIXED' && (
                    <label className="grid gap-2">
                        <span className="text-sm font-medium">Monto fijo que asume Patilandia (en pesos)</span>
                        <Input
                            type="number"
                            defaultValue={settings.shippingSubsidyFixedMinorUnits / 100}
                            disabled={saving}
                            onBlur={e => {
                                const value = currencyToMinor(Number(e.target.value));
                                if (value !== settings.shippingSubsidyFixedMinorUnits) {
                                    save({ shippingSubsidyFixedMinorUnits: value });
                                }
                            }}
                        />
                    </label>
                )}
            </div>

            <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium">Envío gratis desde cierto monto (Mi Paquete)</p>
                        <p className="text-sm text-muted-foreground">
                            Si el subtotal de productos del pedido alcanza este monto, el envío con cualquier
                            transportadora de Mi Paquete sale en $0 — tiene prioridad sobre el subsidio de arriba.
                        </p>
                    </div>
                    <Switch
                        checked={settings.freeShippingThresholdEnabled}
                        disabled={saving}
                        onCheckedChange={checked => save({ freeShippingThresholdEnabled: checked })}
                    />
                </div>
                {settings.freeShippingThresholdEnabled && (
                    <label className="grid gap-2">
                        <span className="text-sm font-medium">Subtotal mínimo (en pesos)</span>
                        <Input
                            type="number"
                            defaultValue={settings.freeShippingThresholdMinorUnits / 100}
                            disabled={saving}
                            onBlur={e => {
                                const value = currencyToMinor(Number(e.target.value));
                                if (value !== settings.freeShippingThresholdMinorUnits) {
                                    save({ freeShippingThresholdMinorUnits: value });
                                }
                            }}
                        />
                    </label>
                )}
            </div>

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
                <div className="space-y-4">
                    <label className="grid gap-2">
                        <span className="text-sm font-medium">Costo del envío propio en Bogotá (en pesos, 0 = gratis)</span>
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
                    </label>

                    <div className="space-y-3 rounded-lg border p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium">Envío propio Bogotá gratis desde cierto monto</p>
                                <p className="text-sm text-muted-foreground">
                                    Umbral independiente del de Mi Paquete arriba — suele tener sentido que sea más
                                    bajo, ya que el envío propio de Bogotá ya es más barato.
                                </p>
                            </div>
                            <Switch
                                checked={settings.bogotaFreeShippingThresholdEnabled}
                                disabled={saving}
                                onCheckedChange={checked => save({ bogotaFreeShippingThresholdEnabled: checked })}
                            />
                        </div>
                        {settings.bogotaFreeShippingThresholdEnabled && (
                            <label className="grid gap-2">
                                <span className="text-sm font-medium">Subtotal mínimo (en pesos)</span>
                                <Input
                                    type="number"
                                    defaultValue={settings.bogotaFreeShippingThresholdMinorUnits / 100}
                                    disabled={saving}
                                    onBlur={e => {
                                        const value = currencyToMinor(Number(e.target.value));
                                        if (value !== settings.bogotaFreeShippingThresholdMinorUnits) {
                                            save({ bogotaFreeShippingThresholdMinorUnits: value });
                                        }
                                    }}
                                />
                            </label>
                        )}
                    </div>
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
