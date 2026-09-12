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
import { Coins, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface LoyaltyRule {
    id: string;
    code: string;
    label: string;
    enabled: boolean;
    kind: 'FLAT' | 'PER_CURRENCY_UNIT';
    points: number | null;
    currencyMinorUnitsPerPoint: number | null;
    description: string;
}

interface LoyaltySettings {
    pointValueInMinorUnits: number;
    maxRedemptionPercentage: number;
}

interface LoyaltyTransaction {
    id: string;
    createdAt: string;
    amount: number;
    type: string;
    ruleCode: string | null;
    referenceType: string | null;
    referenceId: string | null;
    balanceAfter: number;
    account: { customer: { firstName: string; lastName: string; emailAddress: string } };
}

const RULES_QUERY = gql`
    query PatipuntosRules {
        loyaltyRules {
            id
            code
            label
            enabled
            kind
            points
            currencyMinorUnitsPerPoint
            description
        }
    }
`;

const UPDATE_RULE_MUTATION = gql`
    mutation UpdateLoyaltyRule($input: UpdateLoyaltyRuleInput!) {
        updateLoyaltyRule(input: $input) {
            id
        }
    }
`;

const SETTINGS_QUERY = gql`
    query PatipuntosSettings {
        loyaltySettings {
            pointValueInMinorUnits
            maxRedemptionPercentage
        }
    }
`;

const UPDATE_SETTINGS_MUTATION = gql`
    mutation UpdateLoyaltySettings($input: UpdateLoyaltySettingsInput!) {
        updateLoyaltySettings(input: $input) {
            pointValueInMinorUnits
            maxRedemptionPercentage
        }
    }
`;

const TRANSACTIONS_QUERY = gql`
    query PatipuntosTransactions {
        loyaltyTransactions {
            id
            createdAt
            amount
            type
            ruleCode
            referenceType
            referenceId
            balanceAfter
            account {
                customer {
                    firstName
                    lastName
                    emailAddress
                }
            }
        }
    }
`;

const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const currencyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

function minorToCurrency(minorUnits: number): string {
    return currencyFormatter.format(minorUnits / 100);
}

function RulesTab() {
    const [rules, setRules] = useState<LoyaltyRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        try {
            const result = await api.query<{ loyaltyRules: LoyaltyRule[] }>(RULES_QUERY);
            setRules(result.loyaltyRules);
        } catch (err) {
            toast.error('No se pudieron cargar las reglas', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function saveRule(rule: LoyaltyRule, patch: Partial<Pick<LoyaltyRule, 'enabled' | 'points' | 'currencyMinorUnitsPerPoint'>>) {
        setSavingId(rule.id);
        try {
            await api.mutate(UPDATE_RULE_MUTATION, { input: { id: rule.id, ...patch } });
            setRules(current => current.map(r => (r.id === rule.id ? { ...r, ...patch } : r)));
            toast.success('Regla actualizada');
        } catch (err) {
            toast.error('No se pudo actualizar la regla', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setSavingId(null);
        }
    }

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
                        <TableHead>Regla</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Activa</TableHead>
                        <TableHead>Descripción</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rules.map(rule => (
                        <TableRow key={rule.id}>
                            <TableCell className="font-medium">
                                {rule.label}
                                <div className="text-xs text-muted-foreground">{rule.code}</div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                                {rule.kind === 'FLAT' ? (
                                    <div className="flex items-center gap-2">
                                        <Input
                                            className="w-20"
                                            type="number"
                                            defaultValue={rule.points ?? 0}
                                            disabled={savingId === rule.id}
                                            onBlur={e => {
                                                const value = Number(e.target.value);
                                                if (value !== rule.points) saveRule(rule, { points: value });
                                            }}
                                        />
                                        <span className="text-sm text-muted-foreground">puntos</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-sm">
                                        <span>1 punto cada</span>
                                        <Input
                                            className="w-24"
                                            type="number"
                                            defaultValue={rule.currencyMinorUnitsPerPoint ?? 0}
                                            disabled={savingId === rule.id}
                                            onBlur={e => {
                                                const value = Number(e.target.value);
                                                if (value !== rule.currencyMinorUnitsPerPoint) {
                                                    saveRule(rule, { currencyMinorUnitsPerPoint: value });
                                                }
                                            }}
                                        />
                                        <span className="text-muted-foreground">
                                            (unidad menor — {minorToCurrency(rule.currencyMinorUnitsPerPoint ?? 0)})
                                        </span>
                                    </div>
                                )}
                            </TableCell>
                            <TableCell>
                                <Switch
                                    checked={rule.enabled}
                                    disabled={savingId === rule.id}
                                    onCheckedChange={checked => saveRule(rule, { enabled: checked })}
                                />
                            </TableCell>
                            <TableCell className="max-w-[320px] text-sm text-muted-foreground">
                                {rule.description}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function SettingsTab() {
    const [settings, setSettings] = useState<LoyaltySettings | null>(null);
    const [saving, setSaving] = useState(false);

    async function load() {
        try {
            const result = await api.query<{ loyaltySettings: LoyaltySettings }>(SETTINGS_QUERY);
            setSettings(result.loyaltySettings);
        } catch (err) {
            toast.error('No se pudo cargar la configuración', {
                description: err instanceof Error ? err.message : undefined,
            });
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function save() {
        if (!settings) return;
        setSaving(true);
        try {
            await api.mutate(UPDATE_SETTINGS_MUTATION, { input: settings });
            toast.success('Configuración guardada');
        } catch (err) {
            toast.error('No se pudo guardar', { description: err instanceof Error ? err.message : undefined });
        } finally {
            setSaving(false);
        }
    }

    if (!settings) return null;

    return (
        <div className="max-w-md space-y-4">
            <div>
                <label className="text-sm font-medium">Valor del punto (unidad menor de la moneda)</label>
                <Input
                    type="number"
                    value={settings.pointValueInMinorUnits}
                    onChange={e => setSettings({ ...settings, pointValueInMinorUnits: Number(e.target.value) })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                    Equivale a {minorToCurrency(settings.pointValueInMinorUnits)} por punto.
                </p>
            </div>
            <div>
                <label className="text-sm font-medium">Máximo % del subtotal canjeable</label>
                <Input
                    type="number"
                    value={settings.maxRedemptionPercentage}
                    onChange={e => setSettings({ ...settings, maxRedemptionPercentage: Number(e.target.value) })}
                />
            </div>
            <Button onClick={save} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
            </Button>
        </div>
    );
}

function MovementsTab() {
    const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
    const [loading, setLoading] = useState(true);

    async function load() {
        setLoading(true);
        try {
            const result = await api.query<{ loyaltyTransactions: LoyaltyTransaction[] }>(TRANSACTIONS_QUERY);
            setTransactions(result.loyaltyTransactions);
        } catch (err) {
            toast.error('No se pudieron cargar los movimientos', {
                description: err instanceof Error ? err.message : undefined,
            });
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
                        <TableHead>Cliente</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Monto</TableHead>
                        <TableHead>Saldo luego</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead>Fecha</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {transactions.slice(0, 200).map(tx => (
                        <TableRow key={tx.id}>
                            <TableCell>
                                <div className="flex flex-col">
                                    <span>
                                        {tx.account.customer.firstName} {tx.account.customer.lastName}
                                    </span>
                                    <span className="text-xs text-muted-foreground">{tx.account.customer.emailAddress}</span>
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline">{tx.ruleCode ?? tx.type}</Badge>
                            </TableCell>
                            <TableCell className={tx.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                                {tx.amount >= 0 ? '+' : ''}
                                {tx.amount}
                            </TableCell>
                            <TableCell>{tx.balanceAfter}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                                {tx.referenceType ? `${tx.referenceType} #${tx.referenceId}` : '—'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                {dateFormatter.format(new Date(tx.createdAt))}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

type Tab = 'rules' | 'settings' | 'movements';

function LoyaltyPage() {
    const [tab, setTab] = useState<Tab>('rules');

    return (
        <Page pageId="patilandia-loyalty">
            <PageTitle>Patipuntos</PageTitle>
            <PageLayout>
                <PageBlock blockId="loyalty-tabs" column="main">
                    <div className="mb-4 flex items-center gap-2">
                        {(
                            [
                                ['rules', 'Reglas'],
                                ['settings', 'Configuración'],
                                ['movements', 'Movimientos'],
                            ] as [Tab, string][]
                        ).map(([value, label]) => (
                            <Button key={value} size="sm" variant={tab === value ? 'default' : 'outline'} onClick={() => setTab(value)}>
                                {label}
                            </Button>
                        ))}
                    </div>
                    {tab === 'rules' && <RulesTab />}
                    {tab === 'settings' && <SettingsTab />}
                    {tab === 'movements' && <MovementsTab />}
                </PageBlock>
            </PageLayout>
        </Page>
    );
}

defineDashboardExtension({
    routes: [
        {
            path: '/patilandia/patipuntos',
            loader: () => ({ breadcrumb: 'Patipuntos' }),
            navMenuItem: {
                id: 'patipuntos',
                title: 'Patipuntos',
                icon: Coins,
                sectionId: 'patilandia',
            },
            component: LoyaltyPage,
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
