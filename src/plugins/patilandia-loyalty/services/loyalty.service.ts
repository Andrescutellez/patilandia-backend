import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Customer,
    CustomerService,
    Order,
    OrderService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
    isGraphQlErrorResult,
} from '@vendure/core';
import { In, IsNull, QueryFailedError } from 'typeorm';

import { CASH_ON_DELIVERY_PAYMENT_METHOD_CODE, DEFAULT_LOYALTY_RULES } from '../constants';
import { LoyaltyAccount } from '../entities/loyalty-account.entity';
import { LoyaltyRule } from '../entities/loyalty-rule.entity';
import { LoyaltySettings } from '../entities/loyalty-settings.entity';
import { LoyaltyTransaction, LoyaltyTransactionType } from '../entities/loyalty-transaction.entity';

import { LoyaltyEligibilityService } from './loyalty-eligibility.service';

export interface AwardInput {
    ruleCode: string;
    customerEmail: string;
    /** Required for PER_CURRENCY_UNIT rules (e.g. PURCHASE) — the amount to divide by the rule's
     *  rate, in Vendure minor currency units. Ignored for FLAT rules. */
    baseAmountMinorUnits?: number;
    referenceType?: string;
    referenceId?: string;
    /** Deterministic, e.g. `earn:order:123:PURCHASE` — see the class doc comment. */
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
}

interface LedgerEntryInput {
    account: LoyaltyAccount;
    amount: number;
    type: LoyaltyTransactionType;
    ruleCode: string | null;
    referenceType: string | null;
    referenceId: string | null;
    idempotencyKey: string;
    metadata?: Record<string, unknown> | null;
}

function isUniqueViolation(error: unknown): boolean {
    return error instanceof QueryFailedError && (error as unknown as { code?: string }).code === '23505';
}

/**
 * The single choke point for every way a customer can earn, redeem, or lose Patipuntos. Every
 * trigger (order completion, signup, a new pet, an approved review, a birthday, a cancellation)
 * ends up calling `award()`, `applyRedemption()`, or `reverseForOrder()` here — never mutates
 * LoyaltyAccount.balance directly from anywhere else.
 *
 * Anti-duplication: every LoyaltyTransaction carries a unique `idempotencyKey`. `insertLedgerEntry`
 * always INSERTS that row first, alone, before touching the account balance — under Postgres, once
 * one statement in a transaction fails, the whole transaction is poisoned, so the ledger insert
 * must be the thing that fails fast on a duplicate, before any balance mutation has a chance to run.
 * A unique-violation is caught and treated as "already applied," not an error.
 */
@Injectable()
export class LoyaltyService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private orderService: OrderService,
        private eligibilityService: LoyaltyEligibilityService,
    ) {}

    // ---------------------------------------------------------------------------------------
    // Bootstrap / configuration
    // ---------------------------------------------------------------------------------------

    /** Called once from the plugin's onApplicationBootstrap. Idempotent — only inserts defaults
     *  the very first time (empty table), never overwrites admin edits made afterward. */
    async seedDefaultsIfEmpty(ctx: RequestContext): Promise<void> {
        const ruleRepo = this.connection.getRepository(ctx, LoyaltyRule);
        const count = await ruleRepo.count();
        if (count === 0) {
            await ruleRepo.save(DEFAULT_LOYALTY_RULES.map(rule => new LoyaltyRule(rule)));
        }
        await this.getSettings(ctx);
    }

    getRuleByCode(ctx: RequestContext, code: string): Promise<LoyaltyRule | null> {
        return this.connection.getRepository(ctx, LoyaltyRule).findOne({ where: { code } });
    }

    listRules(ctx: RequestContext): Promise<LoyaltyRule[]> {
        return this.connection.getRepository(ctx, LoyaltyRule).find({ order: { code: 'ASC' } });
    }

    async updateRule(
        ctx: RequestContext,
        input: { id: ID; enabled?: boolean; points?: number; currencyMinorUnitsPerPoint?: number },
    ): Promise<LoyaltyRule> {
        const rule = await this.connection.getEntityOrThrow(ctx, LoyaltyRule, input.id);
        if (input.enabled !== undefined) rule.enabled = input.enabled;
        if (input.points !== undefined) rule.points = input.points;
        if (input.currencyMinorUnitsPerPoint !== undefined) {
            rule.currencyMinorUnitsPerPoint = input.currencyMinorUnitsPerPoint;
        }
        return this.connection.getRepository(ctx, LoyaltyRule).save(rule);
    }

    async getSettings(ctx: RequestContext): Promise<LoyaltySettings> {
        const [existing] = await this.connection.getRepository(ctx, LoyaltySettings).find({ take: 1 });
        if (existing) return existing;
        return this.connection.getRepository(ctx, LoyaltySettings).save(new LoyaltySettings());
    }

    async updateSettings(
        ctx: RequestContext,
        input: Partial<Pick<LoyaltySettings, 'pointValueInMinorUnits' | 'maxRedemptionPercentage'>>,
    ): Promise<LoyaltySettings> {
        const settings = await this.getSettings(ctx);
        Object.assign(settings, input);
        return this.connection.getRepository(ctx, LoyaltySettings).save(settings);
    }

    /** The seam a future LoyaltyCampaign (2x/3x, category/date-scoped) would plug into — always 1
     *  today. Nothing else in the earning pipeline needs to change when campaigns are built. */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getActiveMultiplier(ctx: RequestContext, context: { ruleCode: string; order?: Order }): Promise<number> {
        return 1;
    }

    // ---------------------------------------------------------------------------------------
    // Accounts
    // ---------------------------------------------------------------------------------------

    /** Client-facing lookup — a real logged-in session wins over a client-supplied email, and an
     *  anonymous caller can no longer resolve a registered customer's account by email alone. See
     *  PetProfileService.resolveRequestingCustomer for the full reasoning. */
    async findAccountForRequest(ctx: RequestContext, clientEmail?: string | null): Promise<LoyaltyAccount | null> {
        const customer = await this.resolveRequestingCustomer(ctx, clientEmail);
        if (!customer) return null;
        return this.connection
            .getRepository(ctx, LoyaltyAccount)
            .findOne({ where: { customer: { id: customer.id } }, relations: ['customer'] });
    }

    /** Internal/trusted entry point — `email` here always comes from the system's own record of the
     *  order/event customer (order confirmation, signup, review approval, birthday), never directly
     *  from an untrusted client argument. Used by award()/markOrderCompleted()/adjustBalance(). */
    async getOrCreateAccount(ctx: RequestContext, email: string): Promise<LoyaltyAccount> {
        const customer = await this.getOrCreateCustomer(ctx, email);
        return this.getOrCreateAccountForCustomer(ctx, customer);
    }

    /** Client-facing counterpart of getOrCreateAccount — a real logged-in session wins; an
     *  anonymous caller can create/reuse a guest account by email only if that email isn't already
     *  registered. Used by myLoyaltyAccount and applyRedemption. */
    async getOrCreateAccountForRequest(ctx: RequestContext, clientEmail?: string | null): Promise<LoyaltyAccount> {
        const customer = await this.resolveOrCreateRequestingCustomer(ctx, clientEmail);
        return this.getOrCreateAccountForCustomer(ctx, customer);
    }

    /** The CustomerEvent('created') SIGNUP award and whatever originally triggered the customer's
     *  creation both end up here for the same brand-new customer at nearly the same instant — a
     *  find-then-insert race, same shape as the ledger's idempotency handling. Caught the same way:
     *  a unique-violation on the losing insert means the other side already created it. */
    async getOrCreateAccountForCustomer(ctx: RequestContext, customer: Customer): Promise<LoyaltyAccount> {
        const existing = await this.connection
            .getRepository(ctx, LoyaltyAccount)
            .findOne({ where: { customer: { id: customer.id } }, relations: ['customer'] });
        if (existing) return existing;

        try {
            return await this.connection.getRepository(ctx, LoyaltyAccount).save(new LoyaltyAccount({ customer }));
        } catch (error) {
            if (isUniqueViolation(error)) {
                const account = await this.connection
                    .getRepository(ctx, LoyaltyAccount)
                    .findOne({ where: { customer: { id: customer.id } }, relations: ['customer'] });
                if (account) return account;
            }
            throw error;
        }
    }

    listAccounts(ctx: RequestContext): Promise<LoyaltyAccount[]> {
        return this.connection
            .getRepository(ctx, LoyaltyAccount)
            .find({ relations: ['customer'], order: { updatedAt: 'DESC' } });
    }

    async findTransactionsForEmail(ctx: RequestContext, email?: string | null): Promise<LoyaltyTransaction[]> {
        const account = await this.findAccountForRequest(ctx, email);
        if (!account) return [];
        return this.connection
            .getRepository(ctx, LoyaltyTransaction)
            .find({ where: { account: { id: account.id } }, order: { createdAt: 'DESC' } });
    }

    listAllTransactions(ctx: RequestContext): Promise<LoyaltyTransaction[]> {
        return this.connection
            .getRepository(ctx, LoyaltyTransaction)
            .find({ relations: ['account', 'account.customer'], order: { createdAt: 'DESC' } });
    }

    // ---------------------------------------------------------------------------------------
    // Earning
    // ---------------------------------------------------------------------------------------

    /** Returns null when: the rule doesn't exist or is disabled, or the computed award is zero
     *  (e.g. a FLAT-rate PURCHASE base under the currency-per-point rate) — both are legitimate
     *  "nothing to award" outcomes, not errors, so callers (event listeners) shouldn't treat a
     *  null return as a failure. */
    async award(ctx: RequestContext, input: AwardInput): Promise<LoyaltyTransaction | null> {
        const account = await this.getOrCreateAccount(ctx, input.customerEmail);
        return this.awardToAccount(ctx, account, input);
    }

    /**
     * Same as `award()`, but for callers that already hold a resolved LoyaltyAccount and must NOT
     * re-derive it from an email — specifically the SIGNUP subscriber (see event-subscribers.ts).
     * Calling `award()` there raced a second, concurrent `CustomerService.createOrUpdate` against
     * the very `createOrUpdate` call whose CustomerEvent triggered it, and Vendure's own
     * channel-assignment step on the "existing customer" branch isn't safe against that — it threw
     * a duplicate-key error on `customer_channels_channel` under real concurrency (confirmed
     * against the running server, not theoretical). Using the event's own `Customer` entity via
     * `getOrCreateAccountForCustomer` instead avoids the redundant call entirely.
     */
    async awardToAccount(
        ctx: RequestContext,
        account: LoyaltyAccount,
        input: Omit<AwardInput, 'customerEmail'>,
    ): Promise<LoyaltyTransaction | null> {
        const rule = await this.getRuleByCode(ctx, input.ruleCode);
        if (!rule || !rule.enabled) return null;

        const basePoints = this.computeBasePoints(rule, input.baseAmountMinorUnits);
        const multiplier = await this.getActiveMultiplier(ctx, { ruleCode: input.ruleCode });
        const points = Math.floor(basePoints * multiplier);
        if (points <= 0) return null;

        return this.insertLedgerEntry(ctx, {
            account,
            amount: points,
            type: 'EARN',
            ruleCode: input.ruleCode,
            referenceType: input.referenceType ?? null,
            referenceId: input.referenceId ?? null,
            idempotencyKey: input.idempotencyKey,
            metadata: {
                ...input.metadata,
                baseAmountMinorUnits: input.baseAmountMinorUnits ?? null,
                // Snapshot of the rule as applied — the reconciliation task needs the ORIGINAL
                // rate, not whatever the admin may have changed it to since.
                ruleSnapshot: {
                    kind: rule.kind,
                    points: rule.points,
                    currencyMinorUnitsPerPoint: rule.currencyMinorUnitsPerPoint,
                },
            },
        });
    }

    /** Increments the "at least one real purchase" eligibility counter — called once per order
     *  from the PaymentAuthorized listener, alongside (not instead of) awarding PURCHASE points.
     *  Row-locked so two orders for the same brand-new customer completing at the same instant
     *  can't both read `completedOrderCount === 0` and both qualify for FIRST_PURCHASE. */
    async markOrderCompleted(ctx: RequestContext, customerEmail: string): Promise<{ wasFirstOrder: boolean }> {
        const account = await this.getOrCreateAccount(ctx, customerEmail);
        return this.connection.withTransaction(ctx, async txCtx => {
            const accountRepo = this.connection.getRepository(txCtx, LoyaltyAccount);
            const locked = await accountRepo
                .createQueryBuilder('account')
                .setLock('pessimistic_write')
                .where('account.id = :id', { id: account.id })
                .getOneOrFail();
            const wasFirstOrder = locked.completedOrderCount === 0;
            locked.completedOrderCount += 1;
            await accountRepo.save(locked);
            return { wasFirstOrder };
        });
    }

    // ---------------------------------------------------------------------------------------
    // Redemption
    // ---------------------------------------------------------------------------------------

    async applyRedemption(
        ctx: RequestContext,
        params: { orderId: ID; customerEmail?: string | null; points: number },
    ): Promise<{ order: Order; pointsRedeemed: number; discountMinorUnits: number }> {
        const customer = await this.resolveOrCreateRequestingCustomer(ctx, params.customerEmail);
        const order = await this.getOwnedActiveOrder(ctx, params.orderId, customer.id);

        // The ledger is append-only, so a previously-removed redemption's REDEEM row never goes
        // away — "is there one currently active" has to be the net of REDEEM and REVERSAL rows for
        // this order, not "does any REDEEM row exist". `ruleCode IS NULL` distinguishes these from
        // an order-cancellation reversal of an EARN (PURCHASE/etc.) transaction, which keeps its
        // original ruleCode and must NOT count as a blocking redemption here.
        const redemptionTransactions = await this.connection.getRepository(ctx, LoyaltyTransaction).find({
            where: { referenceType: 'Order', referenceId: String(order.id), ruleCode: IsNull(), type: In(['REDEEM', 'REVERSAL']) },
        });
        const netRedeemed = redemptionTransactions.reduce((sum, tx) => sum + tx.amount, 0);
        if (netRedeemed < 0) {
            throw new UserInputError(
                'Ya aplicaste un canje a este pedido — quitalo (removeLoyaltyRedemption) antes de aplicar uno nuevo',
            );
        }

        const account = await this.getOrCreateAccountForCustomer(ctx, customer);
        const eligibility = await this.eligibilityService.check(ctx, account);
        if (!eligibility.eligible) {
            throw new UserInputError(`No podés canjear todavía: ${eligibility.failedChecks.join(', ')}`);
        }

        const settings = await this.getSettings(ctx);
        const maxByPercentage = Math.floor(
            (order.subTotal * settings.maxRedemptionPercentage) / 100 / settings.pointValueInMinorUnits,
        );
        const allowedPoints = Math.max(0, Math.min(params.points, account.balance, maxByPercentage));
        if (allowedPoints <= 0) {
            throw new UserInputError('No hay puntos disponibles para canjear en este pedido');
        }
        const discountMinorUnits = allowedPoints * settings.pointValueInMinorUnits;

        let updatedOrder = order;
        const inserted = await this.insertLedgerEntry(
            ctx,
            {
                account,
                amount: -allowedPoints,
                type: 'REDEEM',
                ruleCode: null,
                referenceType: 'Order',
                referenceId: String(order.id),
                // Includes the count of prior redeem/reversal rows for this order, so a genuinely
                // new redemption cycle (after a remove) gets a fresh key while a same-request retry
                // (nothing has changed yet) still computes the same key and correctly no-ops.
                idempotencyKey: `redeem:order:${order.id}:${redemptionTransactions.length}`,
                metadata: { pointValueInMinorUnits: settings.pointValueInMinorUnits, discountMinorUnits },
            },
            async txCtx => {
                // Runs inside the SAME transaction as the ledger insert + balance debit above —
                // if this throws, the debit rolls back with it. No world where points are
                // deducted with no discount ever applied to the order.
                updatedOrder = await this.orderService.addSurchargeToOrder(txCtx, order.id, {
                    description: 'Descuento Patipuntos',
                    sku: 'PATIPUNTOS',
                    listPrice: -discountMinorUnits,
                    listPriceIncludesTax: ctx.channel.pricesIncludeTax,
                });
                // 'lines' and 'surcharges' must both be joined before a direct save() — saving an
                // Order this way touches computed getters (`discounts`, `taxSummary`) that throw
                // if either relation isn't loaded. Confirmed against the real server.
                const hydrated = await this.connection.getRepository(txCtx, Order).findOneOrFail({
                    where: { id: order.id },
                    relations: ['lines', 'surcharges'],
                });
                hydrated.customFields.loyaltyPointsRedeemed = allowedPoints;
                updatedOrder = await this.connection.getRepository(txCtx, Order).save(hydrated);
            },
        );
        if (!inserted) {
            throw new UserInputError(
                'Ya aplicaste un canje a este pedido — quitalo (removeLoyaltyRedemption) antes de aplicar uno nuevo',
            );
        }

        return { order: updatedOrder, pointsRedeemed: allowedPoints, discountMinorUnits };
    }

    async removeRedemption(ctx: RequestContext, params: { orderId: ID; customerEmail?: string | null }): Promise<Order> {
        const customer = await this.resolveRequestingCustomer(ctx, params.customerEmail);
        if (!customer) {
            throw new UserInputError('Pedido no encontrado');
        }
        const order = await this.getOwnedActiveOrder(ctx, params.orderId, customer.id);

        // Same net-of-REDEEM-and-REVERSAL reasoning as applyRedemption's gate check. Since a new
        // redemption can't be applied while one is already active, there's at most one un-reversed
        // REDEEM row at a time — it's necessarily the most recent one.
        const redemptionTransactions = await this.connection.getRepository(ctx, LoyaltyTransaction).find({
            where: { referenceType: 'Order', referenceId: String(order.id), ruleCode: IsNull(), type: In(['REDEEM', 'REVERSAL']) },
            relations: ['account'],
            order: { createdAt: 'ASC' },
        });
        const netRedeemed = redemptionTransactions.reduce((sum, tx) => sum + tx.amount, 0);
        if (netRedeemed >= 0) {
            return order;
        }
        const activeRedemption = [...redemptionTransactions].reverse().find(tx => tx.type === 'REDEEM');
        if (!activeRedemption) {
            return order;
        }

        let updatedOrder = order;
        await this.insertLedgerEntry(
            ctx,
            {
                account: activeRedemption.account,
                amount: -activeRedemption.amount,
                type: 'REVERSAL',
                ruleCode: null,
                referenceType: 'Order',
                referenceId: String(order.id),
                idempotencyKey: `reversal:order:${order.id}:${activeRedemption.id}`,
            },
            async txCtx => {
                const orderWithSurcharges = await this.connection.getEntityOrThrow(txCtx, Order, order.id, {
                    relations: ['surcharges', 'lines'],
                });
                const surcharge = orderWithSurcharges.surcharges.find(s => s.sku === 'PATIPUNTOS');
                updatedOrder = surcharge
                    ? await this.orderService.removeSurchargeFromOrder(txCtx, order.id, surcharge.id)
                    : orderWithSurcharges;
                updatedOrder.customFields.loyaltyPointsRedeemed = 0;
                await this.connection.getRepository(txCtx, Order).save(updatedOrder);
            },
        );

        return updatedOrder;
    }

    /** Reverses every EARN/REDEEM transaction tied to a cancelled order — the only reachable undo
     *  signal today, since this app's checkout never advances past PaymentAuthorized (refundOrder
     *  throws for any order state at or below it — verified against order.service.js). Once a real
     *  payment gateway lands and orders can reach PaymentSettled, this must ALSO subscribe to
     *  RefundStateTransitionEvent — a settled order can be refunded without being cancelled. */
    async reverseForOrder(ctx: RequestContext, orderId: ID): Promise<void> {
        const originals = await this.connection.getRepository(ctx, LoyaltyTransaction).find({
            where: { referenceType: 'Order', referenceId: String(orderId) },
            relations: ['account'],
        });
        for (const original of originals) {
            if (original.type === 'REVERSAL') continue;
            await this.insertLedgerEntry(ctx, {
                account: original.account,
                amount: -original.amount,
                type: 'REVERSAL',
                ruleCode: original.ruleCode,
                referenceType: 'Order',
                referenceId: String(orderId),
                idempotencyKey: `reversal:order:${orderId}:${original.id}`,
            });
        }
    }

    /** Manual support adjustment (positive or negative) — an admin clicking a button is a distinct,
     *  intentional action each time, unlike a system event that might fire twice, so this doesn't
     *  need the same deterministic idempotency key as award()/applyRedemption(). */
    async adjustBalance(
        ctx: RequestContext,
        params: { customerEmail: string; points: number; reason: string },
    ): Promise<LoyaltyTransaction> {
        const account = await this.getOrCreateAccount(ctx, params.customerEmail);
        const idempotencyKey = `adjustment:manual:${account.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        const result = await this.insertLedgerEntry(ctx, {
            account,
            amount: params.points,
            type: 'ADJUSTMENT',
            ruleCode: null,
            referenceType: 'ManualAdjustment',
            referenceId: null,
            idempotencyKey,
            metadata: { reason: params.reason },
        });
        return result as LoyaltyTransaction;
    }

    // ---------------------------------------------------------------------------------------
    // Cross-plugin verification (used by patilandia-reviews' approval flow, see
    // event-subscribers.ts's ProductReviewApprovedEvent subscriber)
    // ---------------------------------------------------------------------------------------

    /** Whether this customer has a real, completed order containing this product — the gate for
     *  awarding REVIEW points, so reviewing a product you never bought can't earn anything. Uses
     *  the exact same "completed" definition as the PURCHASE/FIRST_PURCHASE award path below
     *  (prepaid counts as soon as the order is placed; cash-on-delivery only once actually
     *  Delivered, since PaymentAuthorized alone doesn't mean the money is secured yet) — see
     *  isCashOnDelivery/handleOrderDelivered in event-subscribers.ts for the original reasoning. */
    async hasVerifiedPurchase(ctx: RequestContext, customerId: ID, productId: ID): Promise<boolean> {
        const orders = await this.connection
            .getRepository(ctx, Order)
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.lines', 'line')
            .leftJoinAndSelect('line.productVariant', 'variant')
            .leftJoinAndSelect('order.payments', 'payment')
            .where('order.customerId = :customerId', { customerId })
            .andWhere('variant.productId = :productId', { productId })
            .getMany();
        return orders.some(order => this.isOrderCompleted(order));
    }

    private isOrderCompleted(order: Order): boolean {
        if (order.state === 'Cancelled') return false;
        const isCod = order.payments?.some(payment => payment.method === CASH_ON_DELIVERY_PAYMENT_METHOD_CODE) ?? false;
        return isCod ? order.state === 'Delivered' : order.active === false;
    }

    // ---------------------------------------------------------------------------------------
    // Reconciliation (scheduled — see scheduled-tasks/loyalty-reconciliation.task.ts)
    // ---------------------------------------------------------------------------------------

    /** Corrects PURCHASE points drift caused by a partial cancellation or `modifyOrder` — both are
     *  reachable from the Admin Dashboard today, change Order.subTotal, and fire no `Cancelled`
     *  transition, so the original award goes stale silently without this. Best-effort: corrects
     *  drift once per order (a second drift on the same order after correction won't re-trigger,
     *  since the adjustment idempotency key is fixed) — acceptable for how rarely this path is hit. */
    async reconcilePurchaseTransactions(ctx: RequestContext): Promise<{ checked: number; corrected: number }> {
        const purchaseTxs = await this.connection.getRepository(ctx, LoyaltyTransaction).find({
            where: { type: 'EARN', ruleCode: 'PURCHASE' },
            relations: ['account'],
        });
        let corrected = 0;
        for (const tx of purchaseTxs) {
            if (!tx.referenceId) continue;
            const order = await this.connection.getRepository(ctx, Order).findOne({ where: { id: tx.referenceId } });
            if (!order) continue;
            const snapshot = tx.metadata?.ruleSnapshot as { currencyMinorUnitsPerPoint?: number } | undefined;
            const rate = snapshot?.currencyMinorUnitsPerPoint;
            if (!rate) continue;
            const expectedPoints = Math.floor(order.subTotal / rate);
            const drift = expectedPoints - tx.amount;
            if (drift === 0) continue;
            const applied = await this.insertLedgerEntry(ctx, {
                account: tx.account,
                amount: drift,
                type: 'ADJUSTMENT',
                ruleCode: 'PURCHASE',
                referenceType: 'Order',
                referenceId: String(order.id),
                idempotencyKey: `adjustment:order:${order.id}:PURCHASE:drift`,
                metadata: { reason: 'subtotal-drift', previousAmount: tx.amount, expectedAmount: expectedPoints },
            });
            if (applied) corrected++;
        }
        return { checked: purchaseTxs.length, corrected };
    }

    /** Releases points debited by applyRedemption() for a checkout that was applied and then
     *  abandoned (order never reached PaymentAuthorized nor got cancelled — Vendure doesn't expire
     *  idle carts on its own). Only touches orders that are still `active` (i.e. genuinely
     *  abandoned, not simply slow to complete). */
    async releaseStaleRedemptions(ctx: RequestContext, olderThanDays: number): Promise<{ released: number }> {
        const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
        const staleRedemptions = await this.connection
            .getRepository(ctx, LoyaltyTransaction)
            .createQueryBuilder('tx')
            .leftJoinAndSelect('tx.account', 'account')
            .where('tx.type = :type', { type: 'REDEEM' })
            .andWhere('tx.createdAt < :cutoff', { cutoff })
            .getMany();

        let released = 0;
        for (const redemption of staleRedemptions) {
            if (!redemption.referenceId) continue;
            const order = await this.connection
                .getRepository(ctx, Order)
                .findOne({ where: { id: redemption.referenceId } });
            if (!order || !order.active) continue;

            const applied = await this.insertLedgerEntry(ctx, {
                account: redemption.account,
                amount: -redemption.amount,
                type: 'REVERSAL',
                ruleCode: null,
                referenceType: 'Order',
                referenceId: String(order.id),
                idempotencyKey: `reversal:order:${order.id}:${redemption.id}:stale`,
                metadata: { reason: 'stale-redemption-release' },
            });
            if (applied) released++;
        }
        return { released };
    }

    // ---------------------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------------------

    private computeBasePoints(rule: LoyaltyRule, baseAmountMinorUnits?: number): number {
        if (rule.kind === 'FLAT') {
            return rule.points ?? 0;
        }
        if (!baseAmountMinorUnits || !rule.currencyMinorUnitsPerPoint) return 0;
        return Math.floor(baseAmountMinorUnits / rule.currencyMinorUnitsPerPoint);
    }

    private async getOrCreateCustomer(ctx: RequestContext, email: string): Promise<Customer> {
        const customer = await this.customerService.createOrUpdate(ctx, {
            emailAddress: email,
            firstName: email.split('@')[0] || 'Cliente',
            lastName: '',
        });
        if (isGraphQlErrorResult(customer)) {
            throw new UserInputError(customer.message);
        }
        return customer;
    }

    /** Same ownership-check shape as PetProfileService.getOwnedPetProfile, but the stakes are
     *  higher here — failing to check this doesn't just leak a stranger's data, it debits a
     *  stranger's point balance. */
    private async getOwnedActiveOrder(ctx: RequestContext, orderId: ID, customerId: ID): Promise<Order> {
        const order = await this.connection.getEntityOrThrow(ctx, Order, orderId, { relations: ['customer'] });
        if (!order.customer || order.customer.id !== customerId) {
            throw new UserInputError('Pedido no encontrado');
        }
        if (!order.active) {
            throw new UserInputError('Este pedido ya no admite cambios');
        }
        return order;
    }

    /** See PetProfileService.resolveRequestingCustomer for the full reasoning — identical shape. */
    private async resolveRequestingCustomer(ctx: RequestContext, clientEmail?: string | null): Promise<Customer | null> {
        if (ctx.activeUserId) {
            return (await this.customerService.findOneByUserId(ctx, ctx.activeUserId)) ?? null;
        }
        if (!clientEmail) return null;
        const customer = await this.connection.getRepository(ctx, Customer).findOne({ where: { emailAddress: clientEmail } });
        if (customer?.user) return null;
        return customer;
    }

    /** See PetProfileService.resolveOrCreateRequestingCustomer — identical shape. */
    private async resolveOrCreateRequestingCustomer(ctx: RequestContext, clientEmail?: string | null): Promise<Customer> {
        if (ctx.activeUserId) {
            const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
            if (!customer) {
                throw new UserInputError('No se encontró un cliente asociado a esta sesión');
            }
            return customer;
        }
        if (!clientEmail) {
            throw new UserInputError('Se requiere iniciar sesión o indicar un correo');
        }
        const existing = await this.connection.getRepository(ctx, Customer).findOne({ where: { emailAddress: clientEmail } });
        if (existing?.user) {
            throw new UserInputError('Ya existe una cuenta con este correo — iniciá sesión para continuar');
        }
        return this.getOrCreateCustomer(ctx, clientEmail);
    }

    /**
     * Inserts one ledger row and updates the cached balance, atomically, with the anti-duplication
     * ordering described in the class doc comment. `additionalWork` (if given) runs inside the same
     * transaction, after the balance update — used by redemption to also apply/remove the Order
     * Surcharge, so a failure there rolls back the point debit too instead of leaving them out of
     * sync.
     */
    private async insertLedgerEntry(
        ctx: RequestContext,
        input: LedgerEntryInput,
        additionalWork?: (txCtx: RequestContext) => Promise<void>,
    ): Promise<LoyaltyTransaction | null> {
        try {
            return await this.connection.withTransaction(ctx, async txCtx => {
                const transactionRepo = this.connection.getRepository(txCtx, LoyaltyTransaction);

                // Insert first, alone. A unique-violation here aborts the transaction before the
                // account row is ever locked or touched. `metadata` is assigned separately, after
                // construction — passing it through the entity's DeepPartial constructor trips up
                // TypeORM's DeepPartial typing for an `any`-typed column.
                const entry = new LoyaltyTransaction({
                    account: input.account,
                    amount: input.amount,
                    type: input.type,
                    ruleCode: input.ruleCode,
                    referenceType: input.referenceType,
                    referenceId: input.referenceId,
                    idempotencyKey: input.idempotencyKey,
                    balanceAfter: 0,
                    expiresAt: null,
                });
                entry.metadata = input.metadata ?? null;
                const placeholder = await transactionRepo.save(entry);

                const accountRepo = this.connection.getRepository(txCtx, LoyaltyAccount);
                const locked = await accountRepo
                    .createQueryBuilder('account')
                    .setLock('pessimistic_write')
                    .where('account.id = :id', { id: input.account.id })
                    .getOneOrFail();

                locked.balance += input.amount;
                if (input.type === 'EARN' && input.amount > 0) {
                    locked.lifetimeEarned += input.amount;
                }
                if (input.type === 'REDEEM' && input.amount < 0) {
                    locked.lifetimeRedeemed += -input.amount;
                }
                await accountRepo.save(locked);

                if (additionalWork) {
                    await additionalWork(txCtx);
                }

                placeholder.balanceAfter = locked.balance;
                return transactionRepo.save(placeholder);
            });
        } catch (error) {
            if (isUniqueViolation(error)) {
                return this.connection
                    .getRepository(ctx, LoyaltyTransaction)
                    .findOne({ where: { idempotencyKey: input.idempotencyKey } });
            }
            throw error;
        }
    }
}
