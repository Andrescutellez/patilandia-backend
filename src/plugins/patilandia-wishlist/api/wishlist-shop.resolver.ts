import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Ctx, RequestContext, Transaction } from '@vendure/core';

import { WishlistItem } from '../entities/wishlist-item.entity';
import { WishlistService } from '../services/wishlist.service';

@Resolver()
export class WishlistShopResolver {
    constructor(private wishlistService: WishlistService) {}

    @Query()
    myWishlist(
        @Ctx() ctx: RequestContext,
        @Args() args: { customerEmail?: string | null },
    ): Promise<WishlistItem[]> {
        return this.wishlistService.findForCustomerEmail(ctx, args.customerEmail);
    }

    @Mutation()
    @Transaction()
    addToWishlist(
        @Ctx() ctx: RequestContext,
        @Args() args: { customerEmail?: string | null; productId: ID },
    ): Promise<WishlistItem> {
        return this.wishlistService.add(ctx, args.customerEmail, args.productId);
    }

    @Mutation()
    @Transaction()
    async removeFromWishlist(
        @Ctx() ctx: RequestContext,
        @Args() args: { customerEmail?: string | null; productId: ID },
    ): Promise<boolean> {
        await this.wishlistService.remove(ctx, args.customerEmail, args.productId);
        return true;
    }

    @Mutation()
    @Transaction()
    syncWishlist(
        @Ctx() ctx: RequestContext,
        @Args() args: { customerEmail?: string | null; productIds: ID[] },
    ): Promise<WishlistItem[]> {
        return this.wishlistService.sync(ctx, args.customerEmail, args.productIds);
    }
}
