import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, ID, RequestContext, Transaction } from '@vendure/core';

import { WishlistItem } from '../entities/wishlist-item.entity';
import { WishlistService } from '../services/wishlist.service';

@Resolver()
export class WishlistAdminResolver {
    constructor(private wishlistService: WishlistService) {}

    @Query()
    @Allow(Permission.ReadCustomer)
    wishlistItems(@Ctx() ctx: RequestContext): Promise<WishlistItem[]> {
        return this.wishlistService.findAll(ctx);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.DeleteCustomer)
    async adminRemoveWishlistItem(@Ctx() ctx: RequestContext, @Args() args: { id: ID }): Promise<boolean> {
        await this.wishlistService.adminRemove(ctx, args.id);
        return true;
    }
}
