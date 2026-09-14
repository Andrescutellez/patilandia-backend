import gql from 'graphql-tag';

const subscriptionTypes = gql`
    type ProductSubscription implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        customer: Customer!
        productVariant: ProductVariant!
        shippingAddress: Address
        quantity: Int!
        frequencyDays: Int!
        status: String!
        nextRenewalDate: DateTime!
        reminderSentAt: DateTime
    }

    input NewSubscriptionAddressInput {
        fullName: String!
        streetLine1: String!
        streetLine2: String
        city: String!
        province: String
        postalCode: String
        countryCode: String!
        phoneNumber: String
        neighborhood: String
        deliveryNotes: String
    }

    input CreateProductSubscriptionInput {
        productVariantId: ID!
        quantity: Int!
        frequencyDays: Int!
        addressId: ID
        newAddress: NewSubscriptionAddressInput
    }

    input UpdateSubscriptionAddressInput {
        id: ID!
        addressId: ID
        newAddress: NewSubscriptionAddressInput
    }
`;

export const shopApiExtensions = gql`
    ${subscriptionTypes}

    extend type Query {
        "Requires a logged-in session — subscriptions are not available to guest checkout."
        mySubscriptions: [ProductSubscription!]!
    }

    extend type Mutation {
        createProductSubscription(input: CreateProductSubscriptionInput!): ProductSubscription!
        pauseSubscription(id: ID!): ProductSubscription!
        resumeSubscription(id: ID!): ProductSubscription!
        cancelSubscription(id: ID!): ProductSubscription!
        updateSubscriptionQuantity(id: ID!, quantity: Int!): ProductSubscription!
        updateSubscriptionFrequency(id: ID!, frequencyDays: Int!): ProductSubscription!
        updateSubscriptionAddress(input: UpdateSubscriptionAddressInput!): ProductSubscription!
    }
`;

export const adminApiExtensions = gql`
    ${subscriptionTypes}

    extend type Query {
        subscriptions(status: String, search: String): [ProductSubscription!]!
    }

    extend type Mutation {
        cancelSubscriptionAdmin(id: ID!): ProductSubscription!
    }
`;
