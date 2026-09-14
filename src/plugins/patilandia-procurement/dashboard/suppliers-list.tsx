import {
    api,
    Badge,
    Button,
    Page,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    toast,
} from '@vendure/dashboard';
import { Link } from '@tanstack/react-router';
import { PlusIcon, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';

import { supplierListQuery } from './suppliers.graphql';

interface SupplierRow {
    id: string;
    name: string;
    contactName: string;
    phone: string;
    email: string;
    active: boolean;
}

function SuppliersListPage() {
    const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api
            .query<{ suppliers: { items: SupplierRow[] } }>(supplierListQuery)
            .then(result => setSuppliers(result.suppliers.items))
            .catch(err => {
                toast.error('No se pudieron cargar los proveedores', { description: err instanceof Error ? err.message : undefined });
            })
            .finally(() => setLoading(false));
    }, []);

    return (
        <Page pageId="patilandia-supplier-list">
            <PageTitle>Proveedores</PageTitle>
            <PageActionBarRight>
                <Button render={<Link to="/patilandia/proveedores/new" />}>
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Nuevo proveedor
                </Button>
            </PageActionBarRight>
            <PageLayout>
                <PageBlock column="main" blockId="suppliers-table">
                    {!loading && suppliers.length === 0 ? (
                        <p className="py-10 text-center text-sm text-muted-foreground">Todavía no hay proveedores.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Contacto</TableHead>
                                    <TableHead>Teléfono</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Activo</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {suppliers.map(supplier => (
                                    <TableRow key={supplier.id}>
                                        <TableCell>
                                            <Link
                                                className="font-medium text-primary hover:underline"
                                                to={`/patilandia/proveedores/${supplier.id}`}
                                            >
                                                {supplier.name}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{supplier.contactName || '—'}</TableCell>
                                        <TableCell>{supplier.phone || '—'}</TableCell>
                                        <TableCell>{supplier.email || '—'}</TableCell>
                                        <TableCell>
                                            <Badge variant={supplier.active ? 'default' : 'outline'}>{supplier.active ? 'Sí' : 'No'}</Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </PageBlock>
            </PageLayout>
        </Page>
    );
}

export const suppliersRoute = {
    path: '/patilandia/proveedores',
    loader: () => ({ breadcrumb: 'Proveedores' }),
    navMenuItem: {
        id: 'proveedores',
        title: 'Proveedores',
        icon: Truck,
        sectionId: 'patilandia',
    },
    component: SuppliersListPage,
};
