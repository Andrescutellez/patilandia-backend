import { RequestContext, VendureEvent } from '@vendure/core';

import { ProductReview } from '../entities/product-review.entity';

/** Published on the false→true approval edge — patilandia-loyalty subscribes to this to award the
 *  REVIEW bonus, without patilandia-reviews needing to know loyalty exists. */
export class ProductReviewApprovedEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public review: ProductReview,
    ) {
        super();
    }
}
