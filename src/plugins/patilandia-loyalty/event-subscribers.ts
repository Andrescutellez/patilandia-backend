import { CustomerEvent, EventBus, Order, OrderStateTransitionEvent, RequestContext, TransactionalConnection } from '@vendure/core';
import { filter } from 'rxjs/operators';

import { PetProfileCreatedEvent } from '../patilandia-pets/events/pet-profile-created-event';
import { ProductReviewApprovedEvent } from '../patilandia-reviews/events/product-review-approved-event';

import { CASH_ON_DELIVERY_PAYMENT_METHOD_CODE } from './constants';
import { LoyaltyService } from './services/loyalty.service';

/** Wires up every trigger that can earn or reverse Patipuntos. Called once from the plugin's
 *  onApplicationBootstrap — see patilandia-loyalty.plugin.ts. */
export function registerLoyaltyEventSubscribers(
    eventBus: EventBus,
    loyaltyService: LoyaltyService,
    connection: TransactionalConnection,
): void {
    eventBus
        .ofType(OrderStateTransitionEvent)
        .pipe(filter(event => event.toState === 'PaymentAuthorized'))
        .subscribe(event => {
            void handleOrderPaymentAuthorized(event.ctx, event.order, loyaltyService, connection);
        });

    eventBus
        .ofType(OrderStateTransitionEvent)
        .pipe(filter(event => event.toState === 'Delivered'))
        .subscribe(event => {
            void handleOrderDelivered(event.ctx, event.order, loyaltyService, connection);
        });

    eventBus
        .ofType(OrderStateTransitionEvent)
        .pipe(filter(event => event.toState === 'Cancelled'))
        .subscribe(event => {
            void loyaltyService.reverseForOrder(event.ctx, event.order.id);
        });

    eventBus
        .ofType(CustomerEvent)
        .pipe(filter(event => event.type === 'created'))
        .subscribe(event => {
            void (async () => {
                // Uses the event's own Customer entity rather than award()'s email-based lookup —
                // see LoyaltyService.awardToAccount for why re-deriving it here races Vendure's own
                // customer/channel assignment for this exact brand-new customer.
                const account = await loyaltyService.getOrCreateAccountForCustomer(event.ctx, event.entity);
                await loyaltyService.awardToAccount(event.ctx, account, {
                    ruleCode: 'SIGNUP',
                    referenceType: 'Customer',
                    referenceId: String(event.entity.id),
                    idempotencyKey: `earn:customer:${event.entity.id}:SIGNUP`,
                });
            })();
        });

    eventBus.ofType(PetProfileCreatedEvent).subscribe(event => {
        void loyaltyService.award(event.ctx, {
            ruleCode: 'PET_REGISTERED',
            customerEmail: event.petProfile.customer.emailAddress,
            referenceType: 'PetProfile',
            referenceId: String(event.petProfile.id),
            idempotencyKey: `earn:pet:${event.petProfile.id}:PET_REGISTERED`,
        });
    });

    eventBus.ofType(ProductReviewApprovedEvent).subscribe(event => {
        void loyaltyService.award(event.ctx, {
            ruleCode: 'REVIEW',
            customerEmail: event.review.authorEmail,
            referenceType: 'ProductReview',
            referenceId: String(event.review.id),
            idempotencyKey: `earn:review:${event.review.id}:REVIEW`,
        });
    });
}

/**
 * On a prepaid order (card, Wompi, Mercado Pago, or this project's current dummy handler),
 * PaymentAuthorized genuinely means the money is secured — that's this app's long-standing
 * definition of "completed purchase" (see Fase 5 in Decisiones y Razonamiento). On a
 * cash-on-delivery order it means no such thing: the order is just assembled, and the customer
 * could still refuse it, be unreachable, etc. Awarding PURCHASE/FIRST_PURCHASE here for COD would
 * be exactly the "puntos por pedidos que podrían no completarse" the brief explicitly ruled out —
 * so COD orders skip this step entirely and only earn once handleOrderDelivered fires.
 */
async function handleOrderPaymentAuthorized(
    ctx: RequestContext,
    eventOrder: Order,
    loyaltyService: LoyaltyService,
    connection: TransactionalConnection,
): Promise<void> {
    const order = await loadOrderForAward(ctx, eventOrder.id, connection);
    if (!order || order.state === 'Cancelled' || !order.customer) return;
    if (isCashOnDelivery(order)) return;

    await awardPurchaseAndFirstPurchase(ctx, order, loyaltyService, connection);
}

/**
 * The deferred counterpart for cash-on-delivery — fires when the order reaches `Delivered`, which
 * in this project happens when an admin confirms it from the Dashboard (there's no courier
 * integration yet, so this is a manual confirmation, exactly as decided with the user). A prepaid
 * order reaching `Delivered` is a no-op here: it already earned its points at PaymentAuthorized,
 * and award()'s idempotencyKey makes a second attempt harmless — but checking isCashOnDelivery
 * first avoids the redundant DB round-trip for the common prepaid case.
 *
 * The real admin sequence to reach `Delivered`, confirmed against the actual order state machine
 * (`Delivered` is NOT reachable directly from `PaymentAuthorized` — verified against a running
 * server, not assumed): (1) Settle the order's payment (`settlePayment` — for COD this represents
 * the courier having collected the cash) → order moves to `PaymentSettled`; (2) add a Fulfillment
 * for the order's lines; (3) transition that Fulfillment to `Shipped`, then to `Delivered` — the
 * order's own state follows automatically once every line is covered. Skipping step 1 leaves the
 * order stuck at `PaymentAuthorized`, where Vendure's own transition guards silently refuse to let
 * it advance to `Shipped`/`Delivered` at all.
 */
async function handleOrderDelivered(
    ctx: RequestContext,
    eventOrder: Order,
    loyaltyService: LoyaltyService,
    connection: TransactionalConnection,
): Promise<void> {
    const order = await loadOrderForAward(ctx, eventOrder.id, connection);
    if (!order || order.state === 'Cancelled' || !order.customer) return;
    if (!isCashOnDelivery(order)) return;

    await awardPurchaseAndFirstPurchase(ctx, order, loyaltyService, connection);
}

function isCashOnDelivery(order: Order): boolean {
    return order.payments?.some(payment => payment.method === CASH_ON_DELIVERY_PAYMENT_METHOD_CODE) ?? false;
}

/**
 * Re-reads the order's current state rather than trusting the event payload — the EventBus doesn't
 * guarantee delivery order between events for the same order, so a same-order Cancelled reversal
 * firing first (or racing this one) must not be undone by a late award. 'lines' and 'surcharges'
 * must be joined too — saving an Order directly (not through OrderService) touches computed
 * getters (`discounts`, `taxSummary`) that throw if either isn't loaded, confirmed against the
 * real server.
 */
function loadOrderForAward(ctx: RequestContext, orderId: Order['id'], connection: TransactionalConnection) {
    return connection
        .getRepository(ctx, Order)
        .findOne({ where: { id: orderId }, relations: ['customer', 'lines', 'surcharges', 'payments'] });
}

async function awardPurchaseAndFirstPurchase(
    ctx: RequestContext,
    order: Order,
    loyaltyService: LoyaltyService,
    connection: TransactionalConnection,
): Promise<void> {
    // Callers already checked !order.customer before calling this — re-checked here only to
    // satisfy the type checker across the function boundary, not because it's expected to trip.
    if (!order.customer) return;
    const customerEmail = order.customer.emailAddress;
    const { wasFirstOrder } = await loyaltyService.markOrderCompleted(ctx, customerEmail);

    // order.subTotal already nets out any Patipuntos redemption surcharge applied before checkout
    // completed — verified against the real server (a $599.000 redemption surcharge reduced
    // subTotal by exactly that much, not just `total`). That's a feature, not a bug: it means
    // PURCHASE points are earned on what the customer actually paid for the products, not on the
    // pre-discount price, so redeeming points can't be used to also farm more points on the same
    // spend.
    const purchaseTx = await loyaltyService.award(ctx, {
        ruleCode: 'PURCHASE',
        customerEmail,
        baseAmountMinorUnits: order.subTotal,
        referenceType: 'Order',
        referenceId: String(order.id),
        idempotencyKey: `earn:order:${order.id}:PURCHASE`,
    });

    const firstPurchaseTx = wasFirstOrder
        ? await loyaltyService.award(ctx, {
              ruleCode: 'FIRST_PURCHASE',
              customerEmail,
              referenceType: 'Order',
              referenceId: String(order.id),
              idempotencyKey: `earn:order:${order.id}:FIRST_PURCHASE`,
          })
        : null;

    const totalEarned = (purchaseTx?.amount ?? 0) + (firstPurchaseTx?.amount ?? 0);
    if (totalEarned > 0) {
        order.customFields.loyaltyPointsEarned = totalEarned;
        await connection.getRepository(ctx, Order).save(order);
    }
}
