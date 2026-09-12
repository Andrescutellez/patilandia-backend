/**
 * One-off: now that Product.customFields.rating/reviewCount are driven by real reviews (see the
 * patilandia-reviews plugin), the fabricated numbers the original seed wrote for every product
 * (e.g. "4.9 stars, 124 reviews" with zero real reviews behind them) need to be replaced by the
 * real aggregate — 0/0 for products with no approved reviews yet, the real average/count for any
 * that already have some. Safe to re-run any time; does not touch products, variants or reviews,
 * only recomputes these two fields.
 *
 *   npx ts-node src/scripts/reset-review-aggregates.ts
 */
import { bootstrapWorker, Logger, ProductService, RequestContextService, TransactionalConnection } from '@vendure/core';

import { config } from '../vendure-config';
import { ProductReview } from './../plugins/patilandia-reviews/entities/product-review.entity';

const loggerCtx = 'ResetReviewAggregates';

async function run() {
    const { app } = await bootstrapWorker(config);
    const ctx = await app.get(RequestContextService).create({ apiType: 'admin' });
    const productService = app.get(ProductService);
    const connection = app.get(TransactionalConnection);

    const { items: products } = await productService.findAll(ctx, { take: 500 });
    for (const product of products) {
        const raw = await connection
            .getRepository(ctx, ProductReview)
            .createQueryBuilder('review')
            .select('AVG(review.rating)', 'avgRating')
            .addSelect('COUNT(review.id)', 'count')
            .where('review.productId = :productId', { productId: product.id })
            .andWhere('review.approved = :approved', { approved: true })
            .getRawOne<{ avgRating: string | null; count: string }>();

        const rating = raw?.avgRating ? Math.round(Number(raw.avgRating) * 10) / 10 : 0;
        const reviewCount = raw?.count ? Number(raw.count) : 0;

        await productService.update(ctx, { id: product.id, customFields: { rating, reviewCount } });
        Logger.info(`  ✔ ${product.name} -> rating ${rating}, reviewCount ${reviewCount}`, loggerCtx);
    }

    Logger.info('Listo.', loggerCtx);
    await app.close();
}

run()
    .then(() => process.exit(0))
    .catch(err => {
        Logger.error(err instanceof Error ? (err.stack ?? err.message) : JSON.stringify(err), loggerCtx);
        process.exit(1);
    });
