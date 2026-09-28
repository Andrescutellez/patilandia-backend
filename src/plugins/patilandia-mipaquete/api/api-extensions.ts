import gql from 'graphql-tag';

const sharedTypes = gql`
    type MipaqueteLocationResult {
        locationCode: String!
        locationName: String!
        departmentOrStateName: String!
    }

    type MipaqueteSettingsResult implements Node {
        id: ID!
        bogotaOwnShippingEnabled: Boolean!
        bogotaOwnShippingCostMinorUnits: Int!
        automaticGuideEnabled: Boolean!
        shippingSubsidyMode: String!
        shippingSubsidyPercentage: Int!
        shippingSubsidyFixedMinorUnits: Int!
        freeShippingThresholdEnabled: Boolean!
        freeShippingThresholdMinorUnits: Int!
        bogotaFreeShippingThresholdEnabled: Boolean!
        bogotaFreeShippingThresholdMinorUnits: Int!
    }

    type MipaqueteFreeShippingSettingsResult {
        generalEnabled: Boolean!
        generalThresholdMinorUnits: Int!
        bogotaEnabled: Boolean!
        bogotaThresholdMinorUnits: Int!
    }

    type MipaqueteShipmentResult implements Node {
        id: ID!
        createdAt: DateTime!
        order: Order!
        state: String!
        mpCode: Int
        deliveryCompanyName: String
        shippingCostMinorUnits: Int!
        trackingCode: String
        pickupCode: String
        lastError: String
    }
`;

export const shopApiExtensions = gql`
    ${sharedTypes}

    extend type Query {
        "Backed by a cached Mi Paquete /getLocations — used by the checkout's city autocomplete to resolve the DANE code a destination address needs."
        mipaqueteLocations(search: String!): [MipaqueteLocationResult!]!
        "Public free-shipping threshold(s) — backs the checkout's progress bar. No auth, no pricing internals (subsidy % / amount excluded)."
        mipaqueteFreeShippingSettings: MipaqueteFreeShippingSettingsResult!
    }
`;

export const adminApiExtensions = gql`
    ${sharedTypes}

    input UpdateMipaqueteSettingsInput {
        bogotaOwnShippingEnabled: Boolean
        bogotaOwnShippingCostMinorUnits: Int
        automaticGuideEnabled: Boolean
        shippingSubsidyMode: String
        shippingSubsidyPercentage: Int
        shippingSubsidyFixedMinorUnits: Int
        freeShippingThresholdEnabled: Boolean
        freeShippingThresholdMinorUnits: Int
        bogotaFreeShippingThresholdEnabled: Boolean
        bogotaFreeShippingThresholdMinorUnits: Int
    }

    extend type Query {
        mipaqueteSettings: MipaqueteSettingsResult!
        "Every shipment attempt, most recent first — including FAILED ones that need manual follow-up."
        mipaqueteShipments: [MipaqueteShipmentResult!]!
        "Variants still sitting on the placeholder default for length/width/height/weight — see vendure-config.ts."
        mipaqueteIncompleteVariants: [ProductVariant!]!
    }

    extend type Mutation {
        updateMipaqueteSettings(input: UpdateMipaqueteSettingsInput!): MipaqueteSettingsResult!
    }
`;
