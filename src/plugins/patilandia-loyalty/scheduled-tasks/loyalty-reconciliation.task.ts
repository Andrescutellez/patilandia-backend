import { ScheduledTask } from '@vendure/core';

import { LoyaltyService } from '../services/loyalty.service';

/** Daily safety-net job covering two gaps that are reachable today from the Admin Dashboard alone
 *  (no real payment gateway needed): a partial line cancellation or `modifyOrder` can shrink
 *  Order.subTotal after PURCHASE points were already awarded, without ever firing the `Cancelled`
 *  transition the main reversal listener relies on; and a redemption applied at checkout but never
 *  followed through to a completed order leaves points debited with nothing to show for it. See
 *  LoyaltyService.reconcilePurchaseTransactions / releaseStaleRedemptions for the detail. */
export const loyaltyReconciliationTask = new ScheduledTask({
    id: 'patipuntos-reconciliation',
    description: 'Corrige desvíos de puntos por pedidos modificados y libera canjes de carritos abandonados',
    schedule: cron => cron.everyDayAt(5, 30),
    execute: async ({ injector, scheduledContext }) => {
        const loyaltyService = injector.get(LoyaltyService);
        const driftCorrection = await loyaltyService.reconcilePurchaseTransactions(scheduledContext);
        const staleReleases = await loyaltyService.releaseStaleRedemptions(scheduledContext, 3);
        return { driftCorrection, staleReleases };
    },
});
