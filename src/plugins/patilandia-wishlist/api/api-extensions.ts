import gql from 'graphql-tag';

const wishlistItemTypes = gql`
  type WishlistItem implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    product: Product!
    customer: Customer!
  }
`;

export const shopApiExtensions = gql`
  ${wishlistItemTypes}

  extend type Query {
    "No login required — identified by email only, same trust level as the rest of the storefront."
    myWishlist(customerEmail: String!): [WishlistItem!]!
  }

  extend type Mutation {
    addToWishlist(customerEmail: String!, productId: ID!): WishlistItem!
    removeFromWishlist(customerEmail: String!, productId: ID!): Boolean!
    "Merges a locally-held list of product ids into the real wishlist for this email. Never removes anything."
    syncWishlist(customerEmail: String!, productIds: [ID!]!): [WishlistItem!]!
  }
`;

export const adminApiExtensions = gql`
  ${wishlistItemTypes}

  extend type Query {
    "Every wishlist item, for support/context — there's no moderation concept here, only the owner ever writes this data."
    wishlistItems: [WishlistItem!]!
  }

  extend type Mutation {
    adminRemoveWishlistItem(id: ID!): Boolean!
  }
`;
