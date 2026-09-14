import {
    api,
    Button,
    defineDashboardExtension,
    Input,
    Label,
    Page,
    PageBlock,
    PageLayout,
    PageTitle,
    Switch,
    Textarea,
    toast,
} from '@vendure/dashboard';
import gql from 'graphql-tag';
import { MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface WhatsappSettings {
    phoneNumber: string;
    enabled: boolean;
    defaultMessage: string;
}

const SETTINGS_QUERY = gql`
    query PatilandiaWhatsappSettings {
        whatsappSettings {
            phoneNumber
            enabled
            defaultMessage
        }
    }
`;

const UPDATE_SETTINGS_MUTATION = gql`
    mutation UpdateWhatsappSettings($input: UpdateWhatsappSettingsInput!) {
        updateWhatsappSettings(input: $input) {
            phoneNumber
            enabled
            defaultMessage
        }
    }
`;

function WhatsappSettingsPage() {
    const [settings, setSettings] = useState<WhatsappSettings | null>(null);
    const [saving, setSaving] = useState(false);

    async function load() {
        try {
            const result = await api.query<{ whatsappSettings: WhatsappSettings }>(SETTINGS_QUERY);
            setSettings(result.whatsappSettings);
        } catch (err) {
            toast.error('No se pudo cargar la configuración de WhatsApp', {
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
            toast.success('Configuración de WhatsApp guardada');
        } catch (err) {
            toast.error('No se pudo guardar', { description: err instanceof Error ? err.message : undefined });
        } finally {
            setSaving(false);
        }
    }

    if (!settings) return null;

    return (
        <Page pageId="patilandia-whatsapp">
            <PageTitle>WhatsApp</PageTitle>
            <PageLayout>
                <PageBlock blockId="whatsapp-settings" column="main">
                    <div className="max-w-md space-y-5">
                        <div className="flex items-center gap-3">
                            <Switch
                                checked={settings.enabled}
                                id="whatsapp-enabled"
                                onCheckedChange={checked => setSettings({ ...settings, enabled: checked })}
                            />
                            <Label htmlFor="whatsapp-enabled">
                                Mostrar el botón de WhatsApp y los links de contacto en el sitio
                            </Label>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Número de WhatsApp</Label>
                            <Input
                                onChange={e => setSettings({ ...settings, phoneNumber: e.target.value })}
                                placeholder="+57 300 1234567"
                                type="tel"
                                value={settings.phoneNumber}
                            />
                            <p className="text-xs text-muted-foreground">
                                Con código de país. Los espacios, guiones y el signo + se ignoran al armar los links.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Mensaje genérico</Label>
                            <Textarea
                                onChange={e => setSettings({ ...settings, defaultMessage: e.target.value })}
                                rows={3}
                                value={settings.defaultMessage}
                            />
                            <p className="text-xs text-muted-foreground">
                                Se usa en el botón flotante cuando la página no tiene un mensaje más específico
                                (por ejemplo, fuera de una página de producto).
                            </p>
                        </div>

                        <Button disabled={saving} onClick={save}>
                            {saving ? 'Guardando…' : 'Guardar'}
                        </Button>
                    </div>
                </PageBlock>
            </PageLayout>
        </Page>
    );
}

defineDashboardExtension({
    routes: [
        {
            path: '/patilandia/whatsapp',
            loader: () => ({ breadcrumb: 'WhatsApp' }),
            navMenuItem: {
                id: 'whatsapp',
                title: 'WhatsApp',
                icon: MessageCircle,
                sectionId: 'patilandia',
            },
            component: WhatsappSettingsPage,
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
