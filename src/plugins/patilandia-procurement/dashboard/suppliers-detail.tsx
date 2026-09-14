import {
    api,
    Button,
    Input,
    Label,
    Page,
    PageActionBar,
    PageBlock,
    PageLayout,
    PageTitle,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Textarea,
    toast,
} from '@vendure/dashboard';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';

import {
    createSupplierDocument,
    createSupplierProductVariantDocument,
    deleteSupplierProductVariantDocument,
    searchProductVariantsQuery,
    supplierDetailDocument,
    supplierProductVariantsQuery,
    updateSupplierDocument,
} from './suppliers.graphql';

const SOURCING_TYPE_LABELS: Record<string, string> = {
    INVENTARIO_PROPIO: 'Inventario propio',
    DROPSHIPPING: 'Dropshipping',
};

interface SupplierProductVariantRow {
    id: string;
    supplierSku: string;
    sourcingType: string;
    currentCostMinorUnits: number;
    productVariant: { id: string; name: string; sku: string };
}

interface VariantSearchResult {
    productVariantId: string;
    productVariantName: string;
    sku: string;
}

interface SupplierForm {
    name: string;
    contactName: string;
    phone: string;
    whatsapp: string;
    email: string;
    address: string;
    notes: string;
    active: boolean;
}

const EMPTY_SUPPLIER: SupplierForm = {
    name: '',
    contactName: '',
    phone: '',
    whatsapp: '',
    email: '',
    address: '',
    notes: '',
    active: true,
};

/** Self-contained "mini CRUD" for the (supplier, variant) sourcing relation — only rendered once
 *  the supplier already exists (a brand-new, unsaved supplier has no id to associate variants
 *  against yet). See SupplierProductVariant's doc comment: this table is what a purchase order line
 *  later relies on to know whether receiving it should touch real stock. */
function AssociatedProductsBlock({ supplierId }: { supplierId: string }) {
    const [rows, setRows] = useState<SupplierProductVariantRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<VariantSearchResult[]>([]);
    const [selectedVariant, setSelectedVariant] = useState<VariantSearchResult | null>(null);
    const [supplierSku, setSupplierSku] = useState('');
    const [sourcingType, setSourcingType] = useState('INVENTARIO_PROPIO');
    const [cost, setCost] = useState('0');
    const [saving, setSaving] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const result = await api.query<{ supplierProductVariants: SupplierProductVariantRow[] }>(supplierProductVariantsQuery, {
                supplierId,
            });
            setRows(result.supplierProductVariants);
        } catch (err) {
            toast.error('No se pudieron cargar los productos asociados', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [supplierId]);

    useEffect(() => {
        if (!searchTerm.trim()) {
            setSearchResults([]);
            return;
        }
        const timeout = setTimeout(async () => {
            try {
                const result = await api.query<{ search: { items: VariantSearchResult[] } }>(searchProductVariantsQuery, {
                    term: searchTerm,
                });
                setSearchResults(result.search.items);
            } catch {
                setSearchResults([]);
            }
        }, 300);
        return () => clearTimeout(timeout);
    }, [searchTerm]);

    async function handleAdd() {
        if (!selectedVariant) {
            toast.error('Elegí una variante primero');
            return;
        }
        setSaving(true);
        try {
            await api.mutate(createSupplierProductVariantDocument, {
                input: {
                    supplierId,
                    productVariantId: selectedVariant.productVariantId,
                    supplierSku: supplierSku.trim() || undefined,
                    sourcingType,
                    currentCostMinorUnits: Math.round((Number(cost) || 0) * 100),
                },
            });
            toast.success('Producto asociado');
            setSelectedVariant(null);
            setSearchTerm('');
            setSupplierSku('');
            setCost('0');
            await load();
        } catch (err) {
            toast.error('No se pudo asociar el producto', { description: err instanceof Error ? err.message : undefined });
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove(id: string) {
        if (!window.confirm('¿Quitar esta asociación?')) return;
        try {
            await api.mutate(deleteSupplierProductVariantDocument, { id });
            await load();
        } catch (err) {
            toast.error('No se pudo quitar', { description: err instanceof Error ? err.message : undefined });
        }
    }

    return (
        <PageBlock column="main" blockId="associated-products" title="Productos asociados">
            <div className="space-y-4">
                {!loading && rows.length > 0 && (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Variante</TableHead>
                                <TableHead>SKU del proveedor</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Costo</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map(row => (
                                <TableRow key={row.id}>
                                    <TableCell>{row.productVariant.name}</TableCell>
                                    <TableCell>{row.supplierSku || '—'}</TableCell>
                                    <TableCell>{SOURCING_TYPE_LABELS[row.sourcingType] ?? row.sourcingType}</TableCell>
                                    <TableCell>${(row.currentCostMinorUnits / 100).toLocaleString('es-CO')}</TableCell>
                                    <TableCell className="text-right">
                                        <Button size="icon" variant="ghost" onClick={() => handleRemove(row.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}

                <div className="space-y-3 rounded-lg border p-4">
                    <Label>Agregar producto</Label>
                    <div className="relative">
                        <Input
                            placeholder="Buscar producto o SKU…"
                            value={selectedVariant ? selectedVariant.productVariantName : searchTerm}
                            onChange={e => {
                                setSelectedVariant(null);
                                setSearchTerm(e.target.value);
                            }}
                        />
                        {searchResults.length > 0 && !selectedVariant && (
                            <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                                {searchResults.map(result => (
                                    <button
                                        key={result.productVariantId}
                                        type="button"
                                        className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                                        onClick={() => {
                                            setSelectedVariant(result);
                                            setSearchResults([]);
                                        }}
                                    >
                                        {result.productVariantName} <span className="text-muted-foreground">({result.sku})</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Input placeholder="SKU del proveedor (opcional)" value={supplierSku} onChange={e => setSupplierSku(e.target.value)} />
                        <Select value={sourcingType} onValueChange={setSourcingType}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="INVENTARIO_PROPIO">Inventario propio</SelectItem>
                                <SelectItem value="DROPSHIPPING">Dropshipping</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input type="number" min="0" step="0.01" placeholder="Costo" value={cost} onChange={e => setCost(e.target.value)} />
                    </div>
                    <Button type="button" disabled={saving} onClick={handleAdd}>
                        {saving ? 'Agregando…' : 'Agregar'}
                    </Button>
                </div>
            </div>
        </PageBlock>
    );
}

export function SupplierDetailPage() {
    const params = useParams({ strict: false }) as { id?: string };
    const navigate = useNavigate();
    const id = params.id;
    const creatingNewEntity = id === 'new';

    const [form, setForm] = useState<SupplierForm>(EMPTY_SUPPLIER);
    const [loading, setLoading] = useState(!creatingNewEntity);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (creatingNewEntity || !id) {
            setLoading(false);
            return;
        }
        api
            .query<{ supplier: SupplierForm | null }>(supplierDetailDocument, { id })
            .then(result => {
                if (result.supplier) setForm(result.supplier);
            })
            .catch(err => {
                toast.error('No se pudo cargar el proveedor', { description: err instanceof Error ? err.message : undefined });
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    async function handleSubmit() {
        if (!form.name.trim()) {
            toast.error('El nombre es obligatorio');
            return;
        }
        setSaving(true);
        try {
            if (creatingNewEntity) {
                const result = await api.mutate<{ createSupplier: { id: string } }>(createSupplierDocument, { input: form });
                toast.success('Proveedor creado');
                await navigate({ to: `/patilandia/proveedores/${result.createSupplier.id}` });
            } else {
                await api.mutate(updateSupplierDocument, { input: { id, ...form } });
                toast.success('Proveedor actualizado');
            }
        } catch (err) {
            toast.error('No se pudo guardar el proveedor', { description: err instanceof Error ? err.message : undefined });
        } finally {
            setSaving(false);
        }
    }

    if (loading) return null;

    return (
        <Page pageId="patilandia-supplier-detail">
            <PageTitle>{creatingNewEntity ? 'Nuevo proveedor' : form.name}</PageTitle>
            <PageActionBar>
                <Button type="button" disabled={saving} onClick={handleSubmit}>
                    {saving ? 'Guardando…' : creatingNewEntity ? 'Crear' : 'Actualizar'}
                </Button>
            </PageActionBar>
            <PageLayout>
                <PageBlock column="main" blockId="main-form" title="Datos del proveedor">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Nombre / razón social</Label>
                            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Nombre del contacto</Label>
                            <Input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Teléfono</Label>
                            <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>WhatsApp</Label>
                            <Input value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Email</Label>
                            <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                        </div>
                        <div className="flex items-center gap-3 self-end pb-1.5">
                            <Switch checked={form.active} onCheckedChange={checked => setForm({ ...form, active: checked })} />
                            <Label>Activo</Label>
                        </div>
                        <div className="sm:col-span-2 space-y-1.5">
                            <Label>Dirección</Label>
                            <Textarea rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                        </div>
                        <div className="sm:col-span-2 space-y-1.5">
                            <Label>Notas</Label>
                            <Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                        </div>
                    </div>
                </PageBlock>
                {!creatingNewEntity && id ? <AssociatedProductsBlock supplierId={id} /> : null}
            </PageLayout>
        </Page>
    );
}

export const supplierDetailRoute = {
    path: '/patilandia/proveedores/$id',
    loader: () => ({ breadcrumb: 'Proveedor' }),
    component: SupplierDetailPage,
};
