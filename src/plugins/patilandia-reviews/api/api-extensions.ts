import gql from 'graphql-tag';

const productReviewTypes = gql`
  type ProductReview implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    product: Product!
    authorName: String!
    authorEmail: String!
    rating: Int!
    title: String!
    body: String!
    approved: Boolean!
  }

  type ProductReviewList implements PaginatedList {
    items: [ProductReview!]!
    totalItems: Int!
  }

  # Generated at run-time by Vendure
  input ProductReviewListOptions
`;

export const adminApiExtensions = gql`
  ${productReviewTypes}

  extend type Query {
    productReviews(options: ProductReviewListOptions): ProductReviewList!
  }

  extend type Mutation {
    approveProductReview(id: ID!): ProductReview!
    rejectProductReview(id: ID!): ProductReview!
    deleteProductReview(id: ID!): Boolean!
  }
`;

export const shopApiExtensions = gql`
  ${productReviewTypes}

  input SubmitProductReviewInput {
    productId: ID!
    authorName: String!
    authorEmail: String!
    rating: Int!
    title: String!
    body: String!
  }

  extend type Query {
    "Only approved reviews — moderation queue lives on the Admin API."
    productReviews(productId: ID!, options: ProductReviewListOptions): ProductReviewList!
  }

  extend type Mutation {
    "Public — no customer login required, matches the rest of the storefront (auth is deferred)."
    submitProductReview(input: SubmitProductReviewInput!): ProductReview!
  }
`;
