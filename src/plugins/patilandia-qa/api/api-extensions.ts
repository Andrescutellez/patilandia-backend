import gql from 'graphql-tag';

const productQuestionTypes = gql`
  type ProductQuestion implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    product: Product!
    authorName: String!
    authorEmail: String!
    question: String!
    answer: String
    answeredAt: DateTime
    approved: Boolean!
  }

  type ProductQuestionList implements PaginatedList {
    items: [ProductQuestion!]!
    totalItems: Int!
  }

  # Generated at run-time by Vendure
  input ProductQuestionListOptions
`;

export const adminApiExtensions = gql`
  ${productQuestionTypes}

  extend type Query {
    productQuestions(options: ProductQuestionListOptions): ProductQuestionList!
  }

  extend type Mutation {
    "The combined 'aprobar y responder' action — a question only goes public once it has a real answer."
    answerProductQuestion(id: ID!, answer: String!): ProductQuestion!
    "Pulls a published question back down (spam, indebida) without discarding its answer."
    hideProductQuestion(id: ID!): ProductQuestion!
    deleteProductQuestion(id: ID!): Boolean!
  }
`;

export const shopApiExtensions = gql`
  ${productQuestionTypes}

  input SubmitProductQuestionInput {
    productId: ID!
    authorName: String!
    authorEmail: String!
    question: String!
  }

  extend type Query {
    "Only answered/approved questions — moderation queue lives on the Admin API."
    productQuestions(productId: ID!, options: ProductQuestionListOptions): ProductQuestionList!
  }

  extend type Mutation {
    "Public — no customer login required, same trust level as product reviews. No Patipuntos are ever tied to this."
    submitProductQuestion(input: SubmitProductQuestionInput!): ProductQuestion!
  }
`;
