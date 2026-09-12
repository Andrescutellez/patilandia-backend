import {
    api,
    Badge,
    Button,
    defineDashboardExtension,
    Page,
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
import gql from 'graphql-tag';
import { PawPrint, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PetProfile {
    id: string;
    createdAt: string;
    name: string;
    species: string;
    breed: string;
    birthDate: string | null;
    sizeLabel: string;
    notes: string;
    customer: { firstName: string; lastName: string; emailAddress: string };
}

const PET_PROFILES_QUERY = gql`
    query PatilandiaPetProfiles {
        petProfiles {
            id
            createdAt
            name
            species
            breed
            birthDate
            sizeLabel
            notes
            customer {
                firstName
                lastName
                emailAddress
            }
        }
    }
`;

const DELETE_MUTATION = gql`
    mutation AdminDeletePetProfile($id: ID!) {
        adminDeletePetProfile(id: $id)
    }
`;

const speciesLabels: Record<string, string> = { dog: 'Perro', cat: 'Gato', other: 'Otra' };
const sizeLabels: Record<string, string> = { pequeno: 'Pequeño', mediano: 'Mediano', grande: 'Grande' };

const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' });

function PetProfilesPage() {
    const [pets, setPets] = useState<PetProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        try {
            const result = await api.query<{ petProfiles: PetProfile[] }>(PET_PROFILES_QUERY);
            setPets(result.petProfiles);
        } catch (err) {
            toast.error('No se pudieron cargar las mascotas', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function remove(id: string) {
        if (!window.confirm('¿Eliminar este perfil de mascota permanentemente?')) {
            return;
        }
        setPendingDeleteId(id);
        try {
            await api.mutate(DELETE_MUTATION, { id });
            toast.success('Perfil de mascota eliminado');
            await load();
        } catch (err) {
            toast.error('No se pudo eliminar el perfil', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setPendingDeleteId(null);
        }
    }

    return (
        <Page pageId="patilandia-pets">
            <PageTitle>Mascotas</PageTitle>
            <PageLayout>
                <PageBlock blockId="pets-table" column="main">
                    <div className="flex items-center justify-end mb-4">
                        <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}>
                            <RotateCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                            Actualizar
                        </Button>
                    </div>

                    {!loading && pets.length === 0 && (
                        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
                            <PawPrint className="h-10 w-10" />
                            <p>Todavía no hay perfiles de mascotas cargados desde la tienda.</p>
                        </div>
                    )}

                    {pets.length > 0 && (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Mascota</TableHead>
                                    <TableHead>Especie</TableHead>
                                    <TableHead>Raza</TableHead>
                                    <TableHead>Tamaño</TableHead>
                                    <TableHead>Dueño</TableHead>
                                    <TableHead>Desde</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pets.map(pet => (
                                    <TableRow key={pet.id}>
                                        <TableCell className="font-medium">{pet.name}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{speciesLabels[pet.species] ?? pet.species}</Badge>
                                        </TableCell>
                                        <TableCell>{pet.breed || '—'}</TableCell>
                                        <TableCell>{sizeLabels[pet.sizeLabel] ?? (pet.sizeLabel || '—')}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span>
                                                    {pet.customer.firstName} {pet.customer.lastName}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {pet.customer.emailAddress}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                            {dateFormatter.format(new Date(pet.createdAt))}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                disabled={pendingDeleteId === pet.id}
                                                onClick={() => remove(pet.id)}
                                            >
                                                Eliminar
                                            </Button>
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

defineDashboardExtension({
    routes: [
        {
            path: '/patilandia/mascotas',
            loader: () => ({ breadcrumb: 'Mascotas' }),
            navMenuItem: {
                id: 'mascotas',
                title: 'Mascotas',
                icon: PawPrint,
                sectionId: 'patilandia',
            },
            component: PetProfilesPage,
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
