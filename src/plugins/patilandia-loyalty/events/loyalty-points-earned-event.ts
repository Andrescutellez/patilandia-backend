import { RequestContext, VendureEvent } from '@vendure/core';

import { LoyaltyAccount } from '../entities/loyalty-account.entity';
import { LoyaltyTransaction } from '../entities/loyalty-transaction.entity';

/** Published once per successful EARN ledger entry (see LoyaltyService.awardToAccount) — covers
 *  every rule (PURCHASE, SIGNUP, FIRST_PURCHASE, PET_REGISTERED, REVIEW, REVIEW_WITH_PHOTO,
 *  PET_BIRTHDAY) through the same event, since they all go through the same insertLedgerEntry
 *  choke point. One handler + one template branches on `transaction.ruleCode` for the copy, instead
 *  of duplicating a near-identical handler/template per rule. */
export class LoyaltyPointsEarnedEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public account: LoyaltyAccount,
        public transaction: LoyaltyTransaction,
    ) {
        super();
    }
}
