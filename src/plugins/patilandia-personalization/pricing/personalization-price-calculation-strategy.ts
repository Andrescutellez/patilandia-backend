import {
    Injector,
    Order,
    OrderItemPriceCalculationStrategy,
    PriceCalculationResult,
    ProductVariant,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { PersonalizationConfig } from '../entities/personalization-config.entity';

/**
 * Adds the configured personalization surcharge to a line's unit price, but ONLY based on the
 * server's own PersonalizationConfig for that product — the customFields the client sent
 * (`personalizationValues`) are only ever used to check "did they ask for personalization at
 * all", never to read a price from. This is the one supported Vendure mechanism for a per-line
 * price that depends on OrderLine custom fields (see the interface's own doc comment — it names
 * "product configurator" as the canonical use case), configured via
 * `orderOptions.orderItemPriceCalculationStrategy` in vendure-config.ts.
 *
 * Queries `TransactionalConnection` directly (duplicating PersonalizationService's tiny lookup)
 * instead of injecting PersonalizationService itself — this strategy is instantiated directly in
 * vendure-config.ts, outside any Nest module, so `injector.get()` can only ever reach genuinely
 * global providers like TransactionalConnection, not a specific plugin's own service (confirmed
 * against the real server: injecting PersonalizationService threw `UnknownElementException`,
 * "this provider does not exist in the current context", at bootstrap).
 */
export class PersonalizationPriceCalculationStrategy implements OrderItemPriceCalculationStrategy {
    private connection: TransactionalConnection;

    init(injector: Injector) {
        this.connection = injector.get(TransactionalConnection);
    }

    async calculateUnitPrice(
        ctx: RequestContext,
        productVariant: ProductVariant,
        orderLineCustomFields: { [key: string]: any },
        _order: Order,
        _quantity: number,
    ): Promise<PriceCalculationResult> {
        const hasPersonalizationValues = Boolean(orderLineCustomFields?.personalizationValues);
        let surcharge = 0;
        if (hasPersonalizationValues) {
            const config = await this.connection.getRepository(ctx, PersonalizationConfig).findOne({
                where: { product: { id: productVariant.productId }, enabled: true },
            });
            surcharge = config?.priceSurchargeMinorUnits ?? 0;
        }
        return {
            price: productVariant.listPrice + surcharge,
            priceIncludesTax: productVariant.listPriceIncludesTax,
        };
    }
}
