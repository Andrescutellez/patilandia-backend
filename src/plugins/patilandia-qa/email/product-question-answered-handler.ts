import { TranslatorService } from '@vendure/core';
import { EmailEventListener } from '@vendure/email-plugin';

import { REPLY_TO, SENDERS } from '../../../email/senders';
import { ProductQuestionAnsweredEvent } from '../events/product-question-answered-event';

/** Recipient is always authorEmail — asking a question needs no account, same trust level as
 *  reviews (see ProductQuestionService's doc comment). Product.name needs TranslatorService, not a
 *  plain property read — same already-fixed issue as review-approved-handler.ts. */
export const productQuestionAnsweredHandler = new EmailEventListener('product-question-answered')
    .on(ProductQuestionAnsweredEvent)
    .loadData(async ({ event, injector }) => {
        const translator = injector.get(TranslatorService);
        return { productName: translator.translate(event.question.product, event.ctx).name };
    })
    .setRecipient(event => event.question.authorEmail)
    .setFrom(SENDERS.hola)
    .setOptionalAddressFields(() => ({ replyTo: REPLY_TO }))
    .setSubject(event => `Respondimos tu pregunta sobre ${event.data.productName}`)
    .setTemplateVars(event => ({
        authorName: event.question.authorName,
        productName: event.data.productName,
        question: event.question.question,
        answer: event.question.answer,
    }));
