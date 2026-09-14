import gql from 'graphql-tag';

const sharedTypes = gql`
  type LoyaltyAccount implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    customer: Customer!
    balance: Int!
    lifetimeEarned: Int!
    lifetimeRedeemed: Int!
    completedOrderCount: Int!
    emailVerifiedAt: DateTime
    "Only populated by myLoyaltyAccount — whether this account can redeem right now, and why not."
    eligible: Boolean
    redemptionBlockedReasons: [String!]
  }

  type LoyaltyTransaction implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    amount: Int!
    type: String!
    ruleCode: String
    referenceType: String
    referenceId: String
    balanceAfter: Int!
    metadata: JSON
  }

  type LoyaltyRule implements Node {
    id: ID!
    code: String!
    label: String!
    enabled: Boolean!
    kind: String!
    points: Int
    currencyMinorUnitsPerPoint: Int
    description: String!
  }

  type LoyaltySettings implements Node {
    id: ID!
    pointValueInMinorUnits: Int!
    maxRedemptionPercentage: Int!
    expirationEnabled: Boolean!
    expirationDays: Int
  }

  type LoyaltyRedemptionResult {
    order: Order!
    pointsRedeemed: Int!
    discountMinorUnits: Int!
  }
`;

export const shopApiExtensions = gql`
  ${sharedTypes}

  extend type Query {
    "Uses the logged-in session when there is one; otherwise falls back to customerEmail for guests."
    myLoyaltyAccount(customerEmail: String): LoyaltyAccount!
    myLoyaltyTransactions(customerEmail: String): [LoyaltyTransaction!]!
    "Public redemption/valuation config — the storefront needs it to compute the redeem cap live."
    loyaltySettings: LoyaltySettings!
    "Only the enabled rules, for a 'cómo ganar puntos' display."
    loyaltyRules: [LoyaltyRule!]!
  }

  extend type Mutation {
    "Sends a one-time verification link to this email — patilandia-loyalty's own flow, not a real login."
    requestLoyaltyEmailVerification(customerEmail: String!): Boolean!
    confirmLoyaltyEmailVerification(token: String!): Boolean!
    "Validates ownership, eligibility, balance and the redemption cap server-side — the points value is never trusted from the client beyond acting as a ceiling."
    applyLoyaltyRedemption(orderId: ID!, customerEmail: String, points: Int!): LoyaltyRedemptionResult!
    removeLoyaltyRedemption(orderId: ID!, customerEmail: String): Order!
  }
`;

export const adminApiExtensions = gql`
  ${sharedTypes}

  input UpdateLoyaltyRuleInput {
    id: ID!
    enabled: Boolean
    points: Int
    currencyMinorUnitsPerPoint: Int
  }

  input UpdateLoyaltySettingsInput {
    pointValueInMinorUnits: Int
    maxRedemptionPercentage: Int
  }

  extend type Query {
    "Every account, for support/context."
    loyaltyAccounts: [LoyaltyAccount!]!
    "Every transaction across every account, for support/audits."
    loyaltyTransactions: [LoyaltyTransaction!]!
    loyaltyRules: [LoyaltyRule!]!
    loyaltySettings: LoyaltySettings!
  }

  extend type Mutation {
    updateLoyaltyRule(input: UpdateLoyaltyRuleInput!): LoyaltyRule!
    updateLoyaltySettings(input: UpdateLoyaltySettingsInput!): LoyaltySettings!
    "Manual support adjustment — points may be negative. Recorded as an ADJUSTMENT ledger entry, same auditability as every other movement."
    adjustLoyaltyBalance(customerEmail: String!, points: Int!, reason: String!): LoyaltyTransaction!
  }
`;
