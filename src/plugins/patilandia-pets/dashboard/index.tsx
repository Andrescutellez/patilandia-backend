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
    toast,
} from '@vendure/dashboard';
import gql from 'graphql-tag';
import { PawPrint, RotateCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface PetProfile {
    id: string;
    createdAt: string;
    name: string;
    species: string;
    breed: string;
    ownerName: string;
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
            ownerName
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

type SortMode = 'recent' | 'name' | 'upcomingBirthday' | 'birthDate';

const sortLabels: Record<SortMode, string> = {
    recent: 'Más recientes',
    name: 'Mascota (A-Z)',
    upcomingBirthday: 'Próximo cumpleaños',
    birthDate: 'Fecha de cumpleaños',
};

/** Days from today to this pet's next birthday (0 = today), ignoring year — a pet born in March
 *  "turns a year" every March regardless of which year it was born. Pets without a birthDate sort
 *  last (Infinity), same reasoning as `computeStock`'s proxy value elsewhere: good enough for
 *  ordering, no need to model it as a real date. */
function daysUntilNextBirthday(birthDate: string | null, today: Date): number {
    if (!birthDate) return Infinity;
    const birth = new Date(birthDate);
    const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
    next.setHours(0, 0, 0, 0);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (next < todayMidnight) {
        next.setFullYear(next.getFullYear() + 1);
    }
    return Math.round((next.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
}

function PetProfilesPage() {
    const [pets, setPets] = useState<PetProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [speciesFilter, setSpeciesFilter] = useState('all');
    const [sortBy, setSortBy] = useState<SortMode>('recent');

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

    const visiblePets = useMemo(() => {
        const today = new Date();
        const query = search.trim().toLowerCase();

        const filtered = pets.filter(pet => {
            if (speciesFilter !== 'all' && pet.species !== speciesFilter) return false;
            if (!query) return true;
            const haystack = [
                pet.name,
                pet.breed,
                pet.ownerName,
                pet.customer.firstName,
                pet.customer.lastName,
                pet.customer.emailAddress,
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(query);
        });

        const sorted = [...filtered];
        switch (sortBy) {
            case 'name':
                sorted.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'upcomingBirthday':
                sorted.sort((a, b) => daysUntilNextBirthday(a.birthDate, today) - daysUntilNextBirthday(b.birthDate, today));
                break;
            case 'birthDate':
                sorted.sort((a, b) => {
                    if (!a.birthDate) return 1;
                    if (!b.birthDate) return -1;
                    return new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime();
                });
                break;
            case 'recent':
            default:
                sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        return sorted;
    }, [pets, search, speciesFilter, sortBy]);

    return (
        <Page pageId="patilandia-pets">
            <PageTitle>Mascotas</PageTitle>
            <PageLayout>
                <PageBlock blockId="pets-table" column="main">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <Input
                                className="w-64"
                                placeholder="Buscar por mascota, raza o dueño..."
                                value={search}
                                onChange={event => setSearch(event.target.value)}
                            />
                            <Select value={speciesFilter} onValueChange={setSpeciesFilter}>
                                <SelectTrigger className="w-40">
                                    <SelectValue placeholder="Especie" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas las especies</SelectItem>
                                    {Object.entries(speciesLabels).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={sortBy} onValueChange={value => setSortBy(value as SortMode)}>
                                <SelectTrigger className="w-52">
                                    <SelectValue placeholder="Ordenar por" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(sortLabels).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
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

                    {pets.length > 0 && visiblePets.length === 0 && (
                        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
                            <PawPrint className="h-10 w-10" />
                            <p>Ninguna mascota coincide con ese filtro.</p>
                        </div>
                    )}

                    {visiblePets.length > 0 && (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Mascota</TableHead>
                                    <TableHead>Especie</TableHead>
                                    <TableHead>Raza</TableHead>
                                    <TableHead>Tamaño</TableHead>
                                    <TableHead>Dueño</TableHead>
                                    <TableHead>Cumpleaños</TableHead>
                                    <TableHead>Desde</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visiblePets.map(pet => {
                                    const daysToGo = daysUntilNextBirthday(pet.birthDate, new Date());
                                    return (
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
                                                        {pet.ownerName ||
                                                            `${pet.customer.firstName} ${pet.customer.lastName}`.trim() ||
                                                            '—'}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {pet.customer.emailAddress}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm whitespace-nowrap">
                                                {pet.birthDate ? (
                                                    <div className="flex flex-col">
                                                        <span>{dateFormatter.format(new Date(pet.birthDate))}</span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {daysToGo === 0 ? '¡Hoy!' : `en ${daysToGo} días`}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
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
                                    );
                                })}
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
