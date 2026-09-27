import { TranslatorService } from '@vendure/core';
import { EmailEventListener } from '@vendure/email-plugin';

import { REPLY_TO, SENDERS } from '../../../email/senders';
import { ProductReviewApprovedEvent } from '../events/product-review-approved-event';

/** Same event patilandia-loyalty already subscribes to for the REVIEW bonus (when there's a
 *  verified purchase) — this notifies the reviewer regardless of whether points were awarded,
 *  since publishing the review itself doesn't depend on that check. Recipient is always
 *  authorEmail, never review.customer.emailAddress — a review can be submitted by someone
 *  identified only by email, with no Customer record resolved (see ProductReviewService).
 *
 *  Product.name has no own column (it lives in ProductTranslation, normally resolved for free by
 *  GraphQL's field resolver) — a plain `event.review.product.name` read here would come back
 *  undefined, the exact bug already found and fixed in the subscription-reminder email. Same fix:
 *  TranslatorService, Vendure's supported way to get it from backend code outside GraphQL. */
export const reviewApprovedHandler = new EmailEventListener('review-approved')
    .on(ProductReviewApprovedEvent)
    .loadData(async ({ event, injector }) => {
        const translator = injector.get(TranslatorService);
        return { productName: translator.translate(event.review.product, event.ctx).name };
    })
    .setRecipient(event => event.review.authorEmail)
    .setFrom(SENDERS.hola)
    .setOptionalAddressFields(() => ({ replyTo: REPLY_TO }))
    .setSubject(event => `¡Tu reseña de ${event.data.productName} ya está publicada! ⭐`)
    .setTemplateVars(event => ({
        authorName: event.review.authorName,
        productName: event.data.productName,
        rating: event.review.rating,
        title: event.review.title,
        body: event.review.body,
    }));
