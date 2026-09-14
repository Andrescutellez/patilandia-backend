import { Card, CardContent, CardHeader, CardTitle, defineDashboardExtension, type PageContextValue } from '@vendure/dashboard';
import gql from 'graphql-tag';
import { Gift } from 'lucide-react';

interface GiftOrderCustomFields {
    isGift?: boolean | null;
    giftWrap?: boolean | null;
    giftMessage?: string | null;
    giftSenderName?: string | null;
    giftAnonymous?: boolean | null;
}

interface GiftShippingAddress {
    fullName?: string | null;
    phoneNumber?: string | null;
    streetLine1?: string | null;
    streetLine2?: string | null;
    city?: string | null;
    province?: string | null;
    customFields?: {
        neighborhood?: string | null;
        deliveryNotes?: string | null;
    } | null;
}

interface GiftOrderEntity {
    customFields?: GiftOrderCustomFields | null;
    shippingAddress?: GiftShippingAddress | null;
}

function isGiftOrder(context: PageContextValue): boolean {
    return Boolean((context.entity as GiftOrderEntity | undefined)?.customFields?.isGift);
}

function GiftOrderCallout({ context }: { context: PageContextValue }) {
    const order = context.entity as GiftOrderEntity | undefined;
    const customFields = order?.customFields;
    if (!customFields?.isGift) return null;

    const address = order?.shippingAddress;
    const addressLine = [address?.streetLine1, address?.streetLine2].filter(Boolean).join(', ');
    const cityLine = [address?.city, address?.province, address?.customFields?.neighborhood]
        .filter(Boolean)
        .join(', ');

    return (
        <Card className="border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/40">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                    <Gift className="h-4 w-4" />
                    Pedido para regalo
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-amber-950 dark:text-amber-100">
                <p className="font-semibold">⚠️ No incluir el precio dentro del paquete.</p>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                        <div className="font-medium">Destinatario</div>
                        <div>{address?.fullName || '—'}</div>
                        <div>{address?.phoneNumber || '—'}</div>
                        <div>{addressLine || '—'}</div>
                        <div>{cityLine || '—'}</div>
                        {address?.customFields?.deliveryNotes ? (
                            <div>Indicaciones de entrega: {address.customFields.deliveryNotes}</div>
                        ) : null}
                    </div>
                    <div className="space-y-1">
                        <div>
                            <span className="font-medium">Envolver para regalo: </span>
                            {customFields.giftWrap ? 'Sí' : 'No'}
                        </div>
                        <div>
                            <span className="font-medium">Anónimo: </span>
                            {customFields.giftAnonymous ? 'Sí' : 'No'}
                        </div>
                        {!customFields.giftAnonymous && (
                            <div>
                                <span className="font-medium">Remitente: </span>
                                {customFields.giftSenderName || '—'}
                            </div>
                        )}
                    </div>
                </div>

                {customFields.giftMessage ? (
                    <div>
                        <div className="font-medium">Mensaje de la tarjeta</div>
                        <div className="italic">"{customFields.giftMessage}"</div>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}

defineDashboardExtension({
    routes: [],
    pageBlocks: [
        {
            id: 'patilandia-gift-order-callout',
            location: {
                pageId: 'order-detail',
                position: { blockId: 'order-table', order: 'before' },
                column: 'main',
            },
            component: GiftOrderCallout,
            shouldRender: isGiftOrder,
        },
    ],
    navSections: [],
    actionBarItems: [],
    alerts: [],
    widgets: [],
    customFormComponents: {},
    dataTables: [],
    detailForms: [
        {
            pageId: 'order-detail',
            // The order-detail page's own query only fetches `shippingAddress` via a fragment that
            // isn't in its `includeNestedFragments` allowlist, so Address customFields (neighborhood,
            // deliveryNotes) never reach it automatically the way Order's own customFields do. This
            // adds the missing selection directly; GraphQL merges it into the existing
            // `shippingAddress` selection rather than conflicting with it.
            extendDetailDocument: gql`
                query ExtendOrderDetailForGifts {
                    order {
                        shippingAddress {
                            customFields {
                                neighborhood
                                deliveryNotes
                            }
                        }
                    }
                }
            `,
        },
    ],
    login: {},
    historyEntries: [],
});
