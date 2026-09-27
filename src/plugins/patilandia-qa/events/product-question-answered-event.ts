import { RequestContext, VendureEvent } from '@vendure/core';

import { ProductQuestion } from '../entities/product-question.entity';

/** Published once a moderator answers a question (ProductQuestionService.answer) — there's no
 *  separate bare-approve step in this plugin, a question only goes public with a real answer
 *  attached, so this single event covers both "approved" and "answered". */
export class ProductQuestionAnsweredEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public question: ProductQuestion,
    ) {
        super();
    }
}
