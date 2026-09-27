import { EmailEventListener } from '@vendure/email-plugin';

import { REPLY_TO, SENDERS } from '../../../email/senders';
import { LoyaltyPointsEarnedEvent } from '../events/loyalty-points-earned-event';

/** One reason string per rule code (see constants.ts's DEFAULT_LOYALTY_RULES) instead of a separate
 *  handler/template per rule — every EARN goes through the same LoyaltyService.awardToAccount
 *  choke point, so one event + one template covers them all. Exported for testing. */
export const POINTS_REASON_COPY: Record<string, string> = {
    PURCHASE: 'por tu compra',
    SIGNUP: 'por registrarte en Patilandia',
    FIRST_PURCHASE: 'por tu primera compra',
    PET_REGISTERED: 'por registrar a tu mascota',
    REVIEW: 'por tu reseña',
    REVIEW_WITH_PHOTO: 'por tu reseña con foto',
    PET_BIRTHDAY: 'por el cumpleaños de tu mascota 🎂',
};

/** PET_BIRTHDAY is special-cased with the pet's actual name when available (see
 *  pet-birthday-bonus.task.ts's metadata.petName) rather than the generic PET_BIRTHDAY copy above. */
export function reasonForTransaction(ruleCode: string | null, petName?: string | null): string {
    if (ruleCode === 'PET_BIRTHDAY' && petName) {
        return `por el cumpleaños de ${petName} 🎂`;
    }
    return (ruleCode && POINTS_REASON_COPY[ruleCode]) || 'en tu cuenta de Patilandia';
}

export const loyaltyPointsEarnedHandler = new EmailEventListener('loyalty-points-earned')
    .on(LoyaltyPointsEarnedEvent)
    .setRecipient(event => event.account.customer.emailAddress)
    .setFrom(SENDERS.hola)
    .setOptionalAddressFields(() => ({ replyTo: REPLY_TO }))
    .setSubject('¡Ganaste Patipuntos! 🐾')
    .setTemplateVars(event => ({
        firstName: event.account.customer.firstName,
        points: event.transaction.amount,
        balance: event.account.balance,
        reason: reasonForTransaction(
            event.transaction.ruleCode,
            (event.transaction.metadata as { petName?: string } | null)?.petName,
        ),
    }));
