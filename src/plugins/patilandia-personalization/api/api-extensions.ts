import gql from 'graphql-tag';

const sharedTypes = gql`
  type PersonalizationFieldOption implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    label: String!
    value: String!
    colorHex: String
    sortOrder: Int!
  }

  type PersonalizationField implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    label: String!
    fieldType: String!
    placeholder: String!
    required: Boolean!
    maxLength: Int
    sortOrder: Int!
    options: [PersonalizationFieldOption!]!
  }

  type PersonalizationConfig implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    enabled: Boolean!
    method: String!
    priceSurchargeMinorUnits: Int!
    fields: [PersonalizationField!]!
  }

  input PersonalizationFieldOptionInput {
    label: String!
    value: String!
    colorHex: String
    sortOrder: Int
  }

  input PersonalizationFieldInput {
    label: String!
    "'text' | 'select' — see PERSONALIZATION_FIELD_TYPES in the plugin's constants.ts"
    fieldType: String!
    placeholder: String
    required: Boolean
    maxLength: Int
    sortOrder: Int
    "Required (non-empty) when fieldType is 'select'."
    options: [PersonalizationFieldOptionInput!]
  }

  input SavePersonalizationConfigInput {
    productId: ID!
    enabled: Boolean!
    method: String
    priceSurchargeMinorUnits: Int
    fields: [PersonalizationFieldInput!]!
  }
`;

export const adminApiExtensions = gql`
  ${sharedTypes}

  extend type Query {
    "Returns the config whether enabled or not, so the Dashboard block can show it toggled off."
    personalizationConfigForProduct(productId: ID!): PersonalizationConfig
  }

  extend type Mutation {
    "Replaces the product's whole personalization config (flag, price, fields and options) in one call."
    savePersonalizationConfig(input: SavePersonalizationConfigInput!): PersonalizationConfig!
  }
`;

export const shopApiExtensions = gql`
  ${sharedTypes}

  extend type Query {
    "Null unless the product is currently enabled for personalization — a disabled config is invisible here."
    personalizationConfigForProduct(productId: ID!): PersonalizationConfig
  }
`;
