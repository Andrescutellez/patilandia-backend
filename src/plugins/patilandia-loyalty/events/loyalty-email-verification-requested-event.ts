import { RequestContext, VendureEvent } from '@vendure/core';

/** Published when a customer asks to verify their email for Patipuntos redemption — the email
 *  handler (see email/loyalty-verification-handler.ts) listens for this to actually send the mail.
 *  Carries the raw (unhashed) token — this is the only place it ever exists outside the outbound
 *  email itself; the DB only ever stores its hash (LoyaltyVerificationToken.tokenHash). */
export class LoyaltyEmailVerificationRequestedEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public email: string,
        public rawToken: string,
    ) {
        super();
    }
}
