import { Inject, Injectable } from '@nestjs/common';
import {
    ActiveOrderService,
    ChannelService,
    Logger,
    OrderService,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
    UserInputError,
    isGraphQlErrorResult,
} from '@vendure/core';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

import { BOLD_PAYMENT_METHOD_CODE, BOLD_TRANSACTION_STATUS_URL, PATILANDIA_BOLD_PLUGIN_OPTIONS, loggerCtx } from '../constants';
import { BoldCheckoutData, BoldPaymentStatus, BoldPaymentStatusValue, PluginInitOptions } from '../types';

/** Vendure stores money as an integer with 2 implied decimals (e.g. 14990000 -> $149,900.00 COP —
 *  see patilandia/src/lib/vendure/client.ts's own VENDURE_MONEY_FACTOR, this is the same idea on
 *  the server side). Bold's `amount` is a plain COP peso integer with no sub-unit at all (its docs'
 *  example: order total "39400" for a $39,400 COP sale) — so converting between the two systems
 *  means dividing by 100, not passing Vendure's raw integer straight through. */
const VENDURE_MONEY_FACTOR = 100;

interface BoldTransactionVoucher {
    payment_status: BoldPaymentStatusValue;
    total?: number;
    reference_id?: string;
    transaction_id?: string;
}

@Injectable()
export class BoldService {
    constructor(
        @Inject(PATILANDIA_BOLD_PLUGIN_OPTIONS) private options: PluginInitOptions,
        private activeOrderService: ActiveOrderService,
        private orderService: OrderService,
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private channelService: ChannelService,
    ) {}

    /** SHA256({orderId}{amount}{currency}{secretKey}) — the exact concatenation order documented
     *  by Bold. Only ever called server-side; the secret key must never reach the browser. */
    private computeIntegritySignature(orderCode: string, amountInCop: number): string {
        const raw = `${orderCode}${amountInCop}COP${this.options.secretKey}`;
        return createHash('sha256').update(raw).digest('hex');
    }

    async generateCheckoutData(ctx: RequestContext): Promise<BoldCheckoutData> {
        const order = await this.activeOrderService.getActiveOrder(ctx, undefined);
        if (!order || order.totalWithTax <= 0) {
            throw new UserInputError('No hay ningún pedido activo para pagar.');
        }

        if (order.state !== 'ArrangingPayment') {
            const result = await this.orderService.transitionToState(ctx, order.id, 'ArrangingPayment');
            if (isGraphQlErrorResult(result)) {
                throw new UserInputError(`No se pudo preparar el pedido para el pago: ${result.message}`);
            }
        }

        // Bold wants a whole COP amount, no decimals — see VENDURE_MONEY_FACTOR above.
        const amount = Math.round(order.totalWithTax / VENDURE_MONEY_FACTOR);
        const signature = this.computeIntegritySignature(order.code, amount);

        return {
            apiKey: this.options.identityKey,
            orderId: order.code,
            amount,
            currency: 'COP',
            signature,
            redirectionUrl: `${this.options.storefrontUrl}/checkout/confirmacion-bold`,
        };
    }

    /** HMAC-SHA256 over base64(rawBody), using the secret key — sandbox transactions sign with an
     *  empty string instead of the real secret (documented Bold quirk, confirmed against
     *  developers.bold.co/webhook). Constant-time compare so this can't be timing-attacked. */
    verifyWebhookSignature(rawBody: Buffer, headerSignature: string | undefined): boolean {
        if (!headerSignature) return false;
        const secret = this.options.sandbox ? '' : this.options.secretKey;
        const expected = createHmac('sha256', secret).update(rawBody.toString('base64')).digest('hex');
        const expectedBuffer = Buffer.from(expected, 'utf8');
        const receivedBuffer = Buffer.from(headerSignature, 'utf8');
        if (expectedBuffer.length !== receivedBuffer.length) return false;
        return timingSafeEqual(expectedBuffer, receivedBuffer);
    }

    private async queryTransactionStatus(orderCode: string): Promise<BoldTransactionVoucher> {
        const response = await fetch(`${BOLD_TRANSACTION_STATUS_URL}/${encodeURIComponent(orderCode)}`, {
            headers: { Authorization: `x-api-key ${this.options.identityKey}` },
        });
        if (!response.ok) {
            Logger.error(`Consulta de transacción Bold falló (${response.status}) para ${orderCode}`, loggerCtx);
            return { payment_status: 'NO_TRANSACTION_FOUND' };
        }
        return (await response.json()) as BoldTransactionVoucher;
    }

    /**
     * Settles the order if Bold reports it approved and it hasn't been settled already. Called
     * from both the webhook (the reliable path) and the confirmation page's active poll (fast
     * feedback + fallback if the webhook hasn't landed yet) — whichever gets there first wins,
     * the other is a safe no-op because addManualPaymentToOrder only accepts an order that's
     * still ArrangingPayment/ArrangingAdditionalPayment.
     */
    private async settleIfApproved(
        ctx: RequestContext,
        orderCode: string,
        voucher: BoldTransactionVoucher,
    ): Promise<void> {
        if (voucher.payment_status !== 'APPROVED') return;

        await this.connection.withTransaction(ctx, async txCtx => {
            const order = await this.orderService.findOneByCode(txCtx, orderCode);
            if (!order) {
                Logger.warn(`Bold reportó un pago aprobado para un pedido inexistente: ${orderCode}`, loggerCtx);
                return;
            }
            if (order.state !== 'ArrangingPayment' && order.state !== 'ArrangingAdditionalPayment') {
                // Already settled (or in some other state) — nothing to do. This is the whole
                // idempotency guard: no separate ledger needed, Vendure's own order state machine
                // already refuses a second payment once one has landed.
                return;
            }

            const result = await this.orderService.addManualPaymentToOrder(txCtx, {
                orderId: order.id,
                method: BOLD_PAYMENT_METHOD_CODE,
                transactionId: voucher.transaction_id ?? orderCode,
                metadata: { source: 'bold', total: voucher.total },
            });
            if (isGraphQlErrorResult(result)) {
                Logger.error(
                    `No se pudo asentar el pago de Bold para ${orderCode}: ${result.message}`,
                    loggerCtx,
                );
            } else {
                Logger.info(`Pago de Bold asentado para el pedido ${orderCode}`, loggerCtx);
            }
        });
    }

    /** Used by the webhook handler, which doesn't have a GraphQL RequestContext of its own. */
    async createSystemContext(): Promise<RequestContext> {
        const defaultChannel = await this.channelService.getDefaultChannel();
        return this.requestContextService.create({ apiType: 'admin', channelOrToken: defaultChannel });
    }

    async settleFromWebhook(orderCode: string, transactionId: string, status: BoldPaymentStatusValue): Promise<void> {
        const ctx = await this.createSystemContext();
        await this.settleIfApproved(ctx, orderCode, { payment_status: status, transaction_id: transactionId });
    }

    /** Active poll from the confirmation page — queries Bold directly (never trusts the redirect
     *  query params alone, per Bold's own documented caveat) and settles as a fallback if the
     *  webhook hasn't arrived yet. */
    async getPaymentStatus(ctx: RequestContext, orderCode: string): Promise<BoldPaymentStatus> {
        const voucher = await this.queryTransactionStatus(orderCode);
        await this.settleIfApproved(ctx, orderCode, voucher);

        const order = await this.orderService.findOneByCode(ctx, orderCode);
        const orderSettled = Boolean(
            order && order.state !== 'ArrangingPayment' && order.state !== 'ArrangingAdditionalPayment',
        );

        return { orderCode, status: voucher.payment_status, orderSettled };
    }
}
