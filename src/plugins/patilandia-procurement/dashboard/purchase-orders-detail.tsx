import {
    api,
    Badge,
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
    createPurchaseOrderDocument,
    purchaseOrderDetailDocument,
    receiveGoodsDocument,
    sendPurchaseOrderDocument,
    supplierProductVariantsForPOQuery,
    suppliersForSelectQuery,
    updatePurchaseOrderDocument,
} from './purchase-orders.graphql';

interface DraftLine {
    productVariantId: string;
    productVariantName: string;
    quantityOrdered: string;
    unitCostMinorUnits: string;
}

interface SupplierOption {
    id: string;
    name: string;
    active: boolean;
}

interface SupplierVariantOption {
    id: string;
    supplierSku: string;
    currentCostMinorUnits: number;
    productVariant: { id: string; name: string; sku: string };
}

interface PurchaseOrderLineRow {
    id: string;
    quantityOrdered: number;
    quantityReceived: number;
    unitCostMinorUnits: number;
    productVariant: { id: string; name: string; sku: string };
}

interface PurchaseOrderDetail {
    id: string;
    status: string;
    orderDate: string;
    notes: string;
    totalMinorUnits: number;
    supplier: { id: string; name: string };
    lines: PurchaseOrderLineRow[];
}

function money(minorUnits: number): string {
    return `$${(minorUnits / 100).toLocaleString('es-CO')}`;
}

/** Lines are plain local state, not tied to any form framework — same pragmatic choice already
 *  made for Personalización's dynamic field editor: a fixed array of typed rows, submitted as-is. */
function LineEditor({
    lines,
    setLines,
    supplierVariants,
    editable,
}: {
    lines: DraftLine[];
    setLines: (lines: DraftLine[]) => void;
    supplierVariants: SupplierVariantOption[];
    editable: boolean;
}) {
    const [pickedVariantId, setPickedVariantId] = useState('');

    function addLine() {
        const option = supplierVariants.find(v => v.productVariant.id === pickedVariantId);
        if (!option) return;
        if (lines.some(line => line.productVariantId === option.productVariant.id)) {
            toast.error('Esa variante ya está en la orden');
            return;
        }
        setLines([
            ...lines,
            {
                productVariantId: option.productVariant.id,
                productVariantName: option.productVariant.name,
                quantityOrdered: '1',
                unitCostMinorUnits: String(option.currentCostMinorUnits / 100),
            },
        ]);
        setPickedVariantId('');
    }

    return (
        <div className="space-y-3">
            {lines.length > 0 && (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Variante</TableHead>
                            <TableHead>Cantidad pedida</TableHead>
                            <TableHead>Costo unitario</TableHead>
                            <TableHead>Subtotal</TableHead>
                            {editable ? <TableHead className="text-right">Quitar</TableHead> : null}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {lines.map((line, index) => (
                            <TableRow key={line.productVariantId}>
                                <TableCell>{line.productVariantName}</TableCell>
                                <TableCell>
                                    {editable ? (
                                        <Input
                                            className="w-24"
                                            type="number"
                                            min="1"
                                            value={line.quantityOrdered}
                                            onChange={e => {
                                                const next = [...lines];
                                                next[index] = { ...line, quantityOrdered: e.target.value };
                                                setLines(next);
                                            }}
                                        />
                                    ) : (
                                        line.quantityOrdered
                                    )}
                                </TableCell>
                                <TableCell>
                                    {editable ? (
                                        <Input
                                            className="w-28"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={line.unitCostMinorUnits}
                                            onChange={e => {
                                                const next = [...lines];
                                                next[index] = { ...line, unitCostMinorUnits: e.target.value };
                                                setLines(next);
                                            }}
                                        />
                                    ) : (
                                        money(Number(line.unitCostMinorUnits) * 100)
                                    )}
                                </TableCell>
                                <TableCell>{money((Number(line.quantityOrdered) || 0) * (Number(line.unitCostMinorUnits) || 0) * 100)}</TableCell>
                                {editable ? (
                                    <TableCell className="text-right">
                                        <Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, i) => i !== index))}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                ) : null}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            {editable ? (
                <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1.5">
                        <Label>Agregar variante</Label>
                        <Select value={pickedVariantId} onValueChange={setPickedVariantId}>
                            <SelectTrigger>
                                <SelectValue placeholder={supplierVariants.length ? 'Elegí una variante' : 'Este proveedor no tiene productos asociados'} />
                            </SelectTrigger>
                            <SelectContent>
                                {supplierVariants.map(option => (
                                    <SelectItem key={option.productVariant.id} value={option.productVariant.id}>
                                        {option.productVariant.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button type="button" variant="outline" disabled={!pickedVariantId} onClick={addLine}>
                        Agregar
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

function ReceiveGoodsBlock({ order, onReceived }: { order: PurchaseOrderDetail; onReceived: () => void }) {
    const [quantities, setQuantities] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const pendingLines = order.lines.filter(line => line.quantityReceived < line.quantityOrdered);

    async function handleReceive() {
        const lines = pendingLines
            .map(line => ({ purchaseOrderLineId: line.id, quantityReceived: Number(quantities[line.id] || 0) }))
            .filter(line => line.quantityReceived > 0);
        if (lines.length === 0) {
            toast.error('Indicá al menos una cantidad recibida');
            return;
        }
        setSaving(true);
        try {
            await api.mutate(receiveGoodsDocument, {
                input: {
                    purchaseOrderId: order.id,
                    idempotencyKey: crypto.randomUUID(),
                    lines,
                },
            });
            toast.success('Recepción registrada');
            setQuantities({});
            onReceived();
        } catch (err) {
            toast.error('No se pudo registrar la recepción', { description: err instanceof Error ? err.message : undefined });
        } finally {
            setSaving(false);
        }
    }

    if (pendingLines.length === 0) return null;

    return (
        <PageBlock column="main" blockId="receive-goods" title="Registrar recepción">
            <div className="space-y-3">
                {pendingLines.map(line => {
                    const outstanding = line.quantityOrdered - line.quantityReceived;
                    return (
                        <div key={line.id} className="flex items-center gap-3">
                            <span className="flex-1 text-sm">
                                {line.productVariant.name} — pendiente {outstanding} de {line.quantityOrdered}
                            </span>
                            <Input
                                className="w-28"
                                type="number"
                                min="0"
                                max={outstanding}
                                placeholder="0"
                                value={quantities[line.id] ?? ''}
                                onChange={e => setQuantities({ ...quantities, [line.id]: e.target.value })}
                            />
                        </div>
                    );
                })}
                <Button type="button" disabled={saving} onClick={handleReceive}>
                    {saving ? 'Registrando…' : 'Registrar recepción'}
                </Button>
                <p className="text-xs text-muted-foreground">
                    Solo se actualiza el stock real para las variantes marcadas como inventario propio con este proveedor.
                </p>
            </div>
        </PageBlock>
    );
}

export function PurchaseOrderDetailPage() {
    const params = useParams({ strict: false }) as { id?: string };
    const navigate = useNavigate();
    const id = params.id;
    const creatingNewEntity = id === 'new';

    const [order, setOrder] = useState<PurchaseOrderDetail | null>(null);
    const [loading, setLoading] = useState(!creatingNewEntity);
    const [saving, setSaving] = useState(false);

    const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
    const [supplierId, setSupplierId] = useState('');
    const [supplierVariants, setSupplierVariants] = useState<SupplierVariantOption[]>([]);
    const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState<DraftLine[]>([]);

    function loadOrder() {
        if (!id || creatingNewEntity) return;
        api
            .query<{ purchaseOrder: PurchaseOrderDetail | null }>(purchaseOrderDetailDocument, { id })
            .then(result => {
                if (!result.purchaseOrder) return;
                setOrder(result.purchaseOrder);
                setSupplierId(result.purchaseOrder.supplier.id);
                setOrderDate(result.purchaseOrder.orderDate.slice(0, 10));
                setNotes(result.purchaseOrder.notes);
                setLines(
                    result.purchaseOrder.lines.map(line => ({
                        productVariantId: line.productVariant.id,
                        productVariantName: line.productVariant.name,
                        quantityOrdered: String(line.quantityOrdered),
                        unitCostMinorUnits: String(line.unitCostMinorUnits / 100),
                    })),
                );
            })
            .catch(err => {
                toast.error('No se pudo cargar la orden', { description: err instanceof Error ? err.message : undefined });
            })
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        loadOrder();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        if (!creatingNewEntity) return;
        api
            .query<{ suppliers: { items: SupplierOption[] } }>(suppliersForSelectQuery)
            .then(result => setSuppliers(result.suppliers.items.filter(s => s.active)));
    }, [creatingNewEntity]);

    useEffect(() => {
        if (!supplierId) {
            setSupplierVariants([]);
            return;
        }
        api
            .query<{ supplierProductVariants: SupplierVariantOption[] }>(supplierProductVariantsForPOQuery, { supplierId })
            .then(result => setSupplierVariants(result.supplierProductVariants));
    }, [supplierId]);

    const isDraft = creatingNewEntity || order?.status === 'BORRADOR';

    async function handleSubmit() {
        if (!supplierId) {
            toast.error('Elegí un proveedor');
            return;
        }
        if (lines.length === 0) {
            toast.error('La orden necesita al menos una línea');
            return;
        }
        const linesInput = lines.map(line => ({
            productVariantId: line.productVariantId,
            quantityOrdered: Number(line.quantityOrdered) || 0,
            unitCostMinorUnits: Math.round((Number(line.unitCostMinorUnits) || 0) * 100),
        }));
        setSaving(true);
        try {
            if (creatingNewEntity) {
                const result = await api.mutate<{ createPurchaseOrder: { id: string } }>(createPurchaseOrderDocument, {
                    input: { supplierId, orderDate: new Date(orderDate).toISOString(), notes, lines: linesInput },
                });
                toast.success('Orden creada');
                await navigate({ to: `/patilandia/ordenes-compra/${result.createPurchaseOrder.id}` });
            } else if (id) {
                await api.mutate(updatePurchaseOrderDocument, {
                    input: { id, orderDate: new Date(orderDate).toISOString(), notes, lines: linesInput },
                });
                toast.success('Orden actualizada');
                loadOrder();
            }
        } catch (err) {
            toast.error('No se pudo guardar la orden', { description: err instanceof Error ? err.message : undefined });
        } finally {
            setSaving(false);
        }
    }

    async function handleSend() {
        if (!order) return;
        try {
            await api.mutate(sendPurchaseOrderDocument, { id: order.id });
            toast.success('Orden marcada como enviada');
            loadOrder();
        } catch (err) {
            toast.error('No se pudo enviar la orden', { description: err instanceof Error ? err.message : undefined });
        }
    }

    if (loading) return null;

    return (
        <Page pageId="patilandia-purchase-order-detail">
            <PageTitle>{creatingNewEntity ? 'Nueva orden de compra' : `Orden #${order?.id ?? ''}`}</PageTitle>
            <PageActionBar>
                {!creatingNewEntity && order?.status === 'BORRADOR' ? (
                    <Button type="button" variant="secondary" onClick={handleSend}>
                        Marcar como enviada
                    </Button>
                ) : null}
                {isDraft ? (
                    <Button type="button" disabled={saving} onClick={handleSubmit}>
                        {saving ? 'Guardando…' : creatingNewEntity ? 'Crear' : 'Actualizar'}
                    </Button>
                ) : null}
            </PageActionBar>
            <PageLayout>
                <PageBlock column="main" blockId="main-form" title="Datos de la orden">
                    <div className="grid gap-4 sm:grid-cols-2">
                        {creatingNewEntity ? (
                            <div className="space-y-1.5">
                                <Label>Proveedor</Label>
                                <Select value={supplierId} onValueChange={setSupplierId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Elegí un proveedor" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {suppliers.map(supplier => (
                                            <SelectItem key={supplier.id} value={supplier.id}>
                                                {supplier.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <Label>Proveedor</Label>
                                <p className="text-sm">{order?.supplier?.name}</p>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label>Fecha</Label>
                            <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} disabled={!isDraft} />
                        </div>
                        {!creatingNewEntity ? (
                            <div className="space-y-1.5">
                                <Label>Estado</Label>
                                <div>
                                    <Badge>{order?.status}</Badge>
                                </div>
                            </div>
                        ) : null}
                        <div className="sm:col-span-2 space-y-1.5">
                            <Label>Notas</Label>
                            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} disabled={!isDraft} />
                        </div>
                    </div>
                </PageBlock>

                <PageBlock column="main" blockId="lines" title="Líneas">
                    <LineEditor lines={lines} setLines={setLines} supplierVariants={supplierVariants} editable={isDraft} />
                </PageBlock>

                {!creatingNewEntity && order ? <ReceiveGoodsBlock order={order} onReceived={loadOrder} /> : null}
            </PageLayout>
        </Page>
    );
}

export const purchaseOrderDetailRoute = {
    path: '/patilandia/ordenes-compra/$id',
    loader: () => ({ breadcrumb: 'Orden de compra' }),
    component: PurchaseOrderDetailPage,
};
