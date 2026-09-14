import {
    api,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Checkbox,
    defineDashboardExtension,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    toast,
    type PageContextValue,
} from '@vendure/dashboard';
import gql from 'graphql-tag';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type FieldType = 'text' | 'select';

interface EditableOption {
    localId: string;
    label: string;
    value: string;
    colorHex: string;
}

interface EditableField {
    localId: string;
    label: string;
    fieldType: FieldType;
    placeholder: string;
    required: boolean;
    maxLength: string;
    options: EditableOption[];
}

let localIdSeq = 0;
function nextLocalId(): string {
    localIdSeq += 1;
    return `local-${localIdSeq}`;
}

function emptyField(): EditableField {
    return {
        localId: nextLocalId(),
        label: '',
        fieldType: 'text',
        placeholder: '',
        required: true,
        maxLength: '',
        options: [],
    };
}

function emptyOption(): EditableOption {
    return { localId: nextLocalId(), label: '', value: '', colorHex: '' };
}

const CONFIG_QUERY = gql`
    query PatilandiaPersonalizationConfig($productId: ID!) {
        personalizationConfigForProduct(productId: $productId) {
            id
            enabled
            method
            priceSurchargeMinorUnits
            fields {
                id
                label
                fieldType
                placeholder
                required
                maxLength
                sortOrder
                options {
                    id
                    label
                    value
                    colorHex
                    sortOrder
                }
            }
        }
    }
`;

const SAVE_MUTATION = gql`
    mutation SavePatilandiaPersonalizationConfig($input: SavePersonalizationConfigInput!) {
        savePersonalizationConfig(input: $input) {
            id
        }
    }
`;

function PersonalizationBlock({ context }: { context: PageContextValue }) {
    const productId: string | undefined = context.entity?.id;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [method, setMethod] = useState('embroidery');
    const [priceSurcharge, setPriceSurcharge] = useState('0');
    const [fields, setFields] = useState<EditableField[]>([]);

    useEffect(() => {
        if (!productId) return;
        setLoading(true);
        api
            .query<{
                personalizationConfigForProduct: {
                    enabled: boolean;
                    method: string;
                    priceSurchargeMinorUnits: number;
                    fields: Array<{
                        label: string;
                        fieldType: string;
                        placeholder: string;
                        required: boolean;
                        maxLength: number | null;
                        options: Array<{ label: string; value: string; colorHex: string | null }>;
                    }>;
                } | null;
            }>(CONFIG_QUERY, { productId })
            .then(result => {
                const config = result.personalizationConfigForProduct;
                if (!config) return;
                setEnabled(config.enabled);
                setMethod(config.method);
                setPriceSurcharge((config.priceSurchargeMinorUnits / 100).toString());
                setFields(
                    config.fields.map(field => ({
                        localId: nextLocalId(),
                        label: field.label,
                        fieldType: field.fieldType === 'select' ? 'select' : 'text',
                        placeholder: field.placeholder,
                        required: field.required,
                        maxLength: field.maxLength != null ? String(field.maxLength) : '',
                        options: field.options.map(option => ({
                            localId: nextLocalId(),
                            label: option.label,
                            value: option.value,
                            colorHex: option.colorHex ?? '',
                        })),
                    })),
                );
            })
            .catch(err => {
                toast.error('No se pudo cargar la configuración de personalización', {
                    description: err instanceof Error ? err.message : undefined,
                });
            })
            .finally(() => setLoading(false));
    }, [productId]);

    function updateField(localId: string, patch: Partial<EditableField>) {
        setFields(current => current.map(field => (field.localId === localId ? { ...field, ...patch } : field)));
    }

    function updateOption(fieldLocalId: string, optionLocalId: string, patch: Partial<EditableOption>) {
        setFields(current =>
            current.map(field =>
                field.localId !== fieldLocalId
                    ? field
                    : {
                          ...field,
                          options: field.options.map(option =>
                              option.localId === optionLocalId ? { ...option, ...patch } : option,
                          ),
                      },
            ),
        );
    }

    async function handleSave() {
        if (!productId) return;
        for (const field of fields) {
            if (!field.label.trim()) {
                toast.error('Todos los campos necesitan un nombre');
                return;
            }
            if (field.fieldType === 'select' && field.options.length === 0) {
                toast.error(`"${field.label}" necesita al menos una opción`);
                return;
            }
        }

        setSaving(true);
        try {
            await api.mutate(SAVE_MUTATION, {
                input: {
                    productId,
                    enabled,
                    method: method.trim() || 'embroidery',
                    priceSurchargeMinorUnits: Math.round((Number(priceSurcharge) || 0) * 100),
                    fields: fields.map((field, index) => ({
                        label: field.label.trim(),
                        fieldType: field.fieldType,
                        placeholder: field.placeholder.trim(),
                        required: field.required,
                        maxLength: field.fieldType === 'text' && field.maxLength ? Number(field.maxLength) : null,
                        sortOrder: index,
                        options:
                            field.fieldType === 'select'
                                ? field.options.map((option, optionIndex) => ({
                                      label: option.label.trim(),
                                      value: option.value.trim() || option.label.trim(),
                                      colorHex: option.colorHex.trim() || null,
                                      sortOrder: optionIndex,
                                  }))
                                : [],
                    })),
                },
            });
            toast.success('Personalización guardada');
        } catch (err) {
            toast.error('No se pudo guardar la personalización', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setSaving(false);
        }
    }

    if (!productId) return null;
    if (loading) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Personalización
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center gap-3">
                    <Switch checked={enabled} onCheckedChange={setEnabled} id="personalization-enabled" />
                    <Label htmlFor="personalization-enabled">Este producto permite personalización</Label>
                </div>

                {enabled && (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label>Tipo de personalización</Label>
                                <Input value={method} onChange={e => setMethod(e.target.value)} placeholder="Bordado" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Precio adicional</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="100"
                                    value={priceSurcharge}
                                    onChange={e => setPriceSurcharge(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label>Campos</Label>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setFields(current => [...current, emptyField()])}
                                >
                                    <Plus className="h-4 w-4" />
                                    Agregar campo
                                </Button>
                            </div>

                            {fields.map(field => (
                                <div key={field.localId} className="space-y-3 rounded-lg border p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="grid flex-1 gap-3 sm:grid-cols-2">
                                            <div className="space-y-1.5">
                                                <Label>Nombre del campo</Label>
                                                <Input
                                                    value={field.label}
                                                    onChange={e => updateField(field.localId, { label: e.target.value })}
                                                    placeholder="Nombre de tu mascota"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Tipo</Label>
                                                <Select
                                                    value={field.fieldType}
                                                    onValueChange={value =>
                                                        updateField(field.localId, { fieldType: value as FieldType })
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="text">Texto</SelectItem>
                                                        <SelectItem value="select">Selección (con opciones)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            onClick={() =>
                                                setFields(current => current.filter(f => f.localId !== field.localId))
                                            }
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-3">
                                        <div className="space-y-1.5">
                                            <Label>Placeholder</Label>
                                            <Input
                                                value={field.placeholder}
                                                onChange={e => updateField(field.localId, { placeholder: e.target.value })}
                                                placeholder="Escribe su nombre"
                                            />
                                        </div>
                                        {field.fieldType === 'text' && (
                                            <div className="space-y-1.5">
                                                <Label>Máximo de caracteres</Label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    value={field.maxLength}
                                                    onChange={e => updateField(field.localId, { maxLength: e.target.value })}
                                                />
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 self-end pb-1.5">
                                            <Checkbox
                                                checked={field.required}
                                                onCheckedChange={checked =>
                                                    updateField(field.localId, { required: checked === true })
                                                }
                                                id={`required-${field.localId}`}
                                            />
                                            <Label htmlFor={`required-${field.localId}`}>Obligatorio</Label>
                                        </div>
                                    </div>

                                    {field.fieldType === 'select' && (
                                        <div className="space-y-2 border-t pt-3">
                                            <div className="flex items-center justify-between">
                                                <Label>Opciones</Label>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() =>
                                                        updateField(field.localId, {
                                                            options: [...field.options, emptyOption()],
                                                        })
                                                    }
                                                >
                                                    <Plus className="h-4 w-4" />
                                                    Agregar opción
                                                </Button>
                                            </div>
                                            {field.options.map(option => (
                                                <div key={option.localId} className="flex items-center gap-2">
                                                    <Input
                                                        className="flex-1"
                                                        placeholder="Nombre (ej. Dorado)"
                                                        value={option.label}
                                                        onChange={e =>
                                                            updateOption(field.localId, option.localId, {
                                                                label: e.target.value,
                                                            })
                                                        }
                                                    />
                                                    <Input
                                                        type="color"
                                                        className="w-14 p-1"
                                                        value={option.colorHex || '#ffffff'}
                                                        onChange={e =>
                                                            updateOption(field.localId, option.localId, {
                                                                colorHex: e.target.value,
                                                            })
                                                        }
                                                    />
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        onClick={() =>
                                                            updateField(field.localId, {
                                                                options: field.options.filter(
                                                                    o => o.localId !== option.localId,
                                                                ),
                                                            })
                                                        }
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                <Button type="button" disabled={saving} onClick={handleSave}>
                    {saving ? 'Guardando…' : 'Guardar personalización'}
                </Button>
            </CardContent>
        </Card>
    );
}

defineDashboardExtension({
    routes: [],
    pageBlocks: [
        {
            id: 'patilandia-personalization-block',
            title: 'Personalización',
            location: {
                pageId: 'product-detail',
                position: { blockId: 'custom-fields', order: 'after' },
                column: 'main',
            },
            component: PersonalizationBlock,
        },
    ],
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
