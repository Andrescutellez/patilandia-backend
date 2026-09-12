import { defineDashboardExtension } from '@vendure/dashboard';
import { PawPrint } from 'lucide-react';

import logoUrl from './assets/logo.png';

function PatilandiaLoginLogo() {
    return <img alt="Patilandia" className="h-10 w-auto" src={logoUrl} />;
}

function PatilandiaWelcome() {
    return (
        <div className="flex flex-col items-center text-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Bienvenido a Patilandia Admin</h1>
            <p className="text-sm text-muted-foreground">Inicia sesión para gestionar la tienda</p>
        </div>
    );
}

// Every Patilandia-specific capability (perfiles de mascotas, Patipuntos, reseñas, configurador de
// camitas, etc.) is its own plugin, with its own entity/service/resolver on the backend and its
// own slice of the Dashboard — see the migration plan and Decisiones y Razonamiento.md. This
// plugin only owns the shared "Patilandia" nav section and the login branding; the real pages
// (Mascotas, Reseñas...) register their routes into this section from their own plugins.
defineDashboardExtension({
    routes: [],
    navSections: [
        {
            id: 'patilandia',
            title: 'Patilandia',
            icon: PawPrint,
            placement: 'top',
            order: -1,
        },
    ],
    login: {
        logo: { component: PatilandiaLoginLogo },
        beforeForm: { component: PatilandiaWelcome },
    },
    pageBlocks: [],
    actionBarItems: [],
    alerts: [],
    widgets: [],
    customFormComponents: {},
    dataTables: [],
    detailForms: [],
    historyEntries: [],
});
