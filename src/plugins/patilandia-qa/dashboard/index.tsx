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
    Textarea,
    toast,
} from '@vendure/dashboard';
import gql from 'graphql-tag';
import { HelpCircle, MessageCircleQuestion, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface QuestionProduct {
    id: string;
    name: string;
}

interface ProductQuestion {
    id: string;
    createdAt: string;
    authorName: string;
    authorEmail: string;
    question: string;
    answer: string | null;
    approved: boolean;
    product: QuestionProduct;
}

const QUESTIONS_QUERY = gql`
    query PatilandiaProductQuestions($options: ProductQuestionListOptions) {
        productQuestions(options: $options) {
            items {
                id
                createdAt
                authorName
                authorEmail
                question
                answer
                approved
                product {
                    id
                    name
                }
            }
            totalItems
        }
    }
`;

const ANSWER_MUTATION = gql`
    mutation AnswerProductQuestion($id: ID!, $answer: String!) {
        answerProductQuestion(id: $id, answer: $answer) {
            id
        }
    }
`;

const HIDE_MUTATION = gql`
    mutation HideProductQuestion($id: ID!) {
        hideProductQuestion(id: $id) {
            id
        }
    }
`;

const DELETE_MUTATION = gql`
    mutation DeleteProductQuestion($id: ID!) {
        deleteProductQuestion(id: $id)
    }
`;

type StatusFilter = 'pending' | 'approved' | 'all';

const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

function QuestionsPage() {
    const [questions, setQuestions] = useState<ProductQuestion[]>([]);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [pendingActionId, setPendingActionId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');

    async function load() {
        setLoading(true);
        try {
            const result = await api.query<{ productQuestions: { items: ProductQuestion[]; totalItems: number } }>(
                QUESTIONS_QUERY,
                { options: { take: 200, sort: { createdAt: 'DESC' } } },
            );
            setQuestions(result.productQuestions.items);
        } catch (err) {
            toast.error('No se pudieron cargar las preguntas', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function answer(id: string) {
        const draft = (drafts[id] ?? '').trim();
        if (!draft) {
            toast.error('Escribí una respuesta antes de publicar');
            return;
        }
        setPendingActionId(id);
        try {
            await api.mutate(ANSWER_MUTATION, { id, answer: draft });
            toast.success('Pregunta respondida y publicada');
            setDrafts(current => {
                const next = { ...current };
                delete next[id];
                return next;
            });
            await load();
        } catch (err) {
            toast.error('No se pudo publicar la respuesta', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setPendingActionId(null);
        }
    }

    async function hide(id: string) {
        setPendingActionId(id);
        try {
            await api.mutate(HIDE_MUTATION, { id });
            toast.success('Pregunta ocultada');
            await load();
        } catch (err) {
            toast.error('No se pudo ocultar la pregunta', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setPendingActionId(null);
        }
    }

    async function remove(id: string) {
        if (!window.confirm('¿Eliminar esta pregunta permanentemente? Esta acción no se puede deshacer.')) {
            return;
        }
        setPendingActionId(id);
        try {
            await api.mutate(DELETE_MUTATION, { id });
            toast.success('Pregunta eliminada');
            await load();
        } catch (err) {
            toast.error('No se pudo eliminar la pregunta', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setPendingActionId(null);
        }
    }

    const pendingCount = questions.filter(q => !q.approved).length;
    const visible = questions.filter(q => {
        if (statusFilter === 'pending') return !q.approved;
        if (statusFilter === 'approved') return q.approved;
        return true;
    });

    return (
        <Page pageId="patilandia-qa">
            <PageTitle>Preguntas</PageTitle>
            <PageLayout>
                <PageBlock blockId="questions-table" column="main">
                    <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-2">
                            {(
                                [
                                    ['pending', `Pendientes${pendingCount ? ` (${pendingCount})` : ''}`],
                                    ['approved', 'Respondidas'],
                                    ['all', 'Todas'],
                                ] as [StatusFilter, string][]
                            ).map(([value, label]) => (
                                <Button
                                    key={value}
                                    size="sm"
                                    variant={statusFilter === value ? 'default' : 'outline'}
                                    onClick={() => setStatusFilter(value)}
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}>
                            <RotateCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                            Actualizar
                        </Button>
                    </div>

                    {!loading && visible.length === 0 && (
                        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
                            <MessageCircleQuestion className="h-10 w-10" />
                            <p>
                                {statusFilter === 'pending'
                                    ? 'No hay preguntas pendientes de moderación.'
                                    : 'No hay preguntas en esta vista.'}
                            </p>
                        </div>
                    )}

                    {visible.length > 0 && (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Autor</TableHead>
                                    <TableHead>Pregunta / Respuesta</TableHead>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visible.map(question => (
                                    <TableRow key={question.id}>
                                        <TableCell className="font-medium max-w-[160px] truncate">
                                            {question.product?.name ?? '—'}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span>{question.authorName}</span>
                                                <span className="text-xs text-muted-foreground">{question.authorEmail}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="max-w-[360px] space-y-2">
                                            <p className="text-sm">{question.question}</p>
                                            {question.approved ? (
                                                <p className="text-sm text-muted-foreground">
                                                    <strong className="text-foreground">Respuesta: </strong>
                                                    {question.answer}
                                                </p>
                                            ) : (
                                                <Textarea
                                                    className="text-sm"
                                                    placeholder="Escribí la respuesta pública…"
                                                    rows={2}
                                                    value={drafts[question.id] ?? ''}
                                                    onChange={event =>
                                                        setDrafts(current => ({ ...current, [question.id]: event.target.value }))
                                                    }
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                            {dateFormatter.format(new Date(question.createdAt))}
                                        </TableCell>
                                        <TableCell>
                                            {question.approved ? (
                                                <Badge variant="outline">Publicada</Badge>
                                            ) : (
                                                <Badge variant="secondary">Pendiente</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right space-x-2 whitespace-nowrap">
                                            {question.approved ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={pendingActionId === question.id}
                                                    onClick={() => hide(question.id)}
                                                >
                                                    Ocultar
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    disabled={pendingActionId === question.id}
                                                    onClick={() => answer(question.id)}
                                                >
                                                    Responder y publicar
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                disabled={pendingActionId === question.id}
                                                onClick={() => remove(question.id)}
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
            path: '/patilandia/preguntas',
            loader: () => ({ breadcrumb: 'Preguntas' }),
            navMenuItem: {
                id: 'preguntas',
                title: 'Preguntas',
                icon: HelpCircle,
                sectionId: 'patilandia',
            },
            component: QuestionsPage,
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
