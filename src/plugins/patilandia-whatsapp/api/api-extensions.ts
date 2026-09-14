import gql from 'graphql-tag';

const whatsappTypes = gql`
    type WhatsappSettings {
        id: ID!
        phoneNumber: String!
        enabled: Boolean!
        defaultMessage: String!
    }

    input UpdateWhatsappSettingsInput {
        phoneNumber: String
        enabled: Boolean
        defaultMessage: String
    }
`;

export const shopApiExtensions = gql`
    ${whatsappTypes}

    extend type Query {
        "Public — every visitor needs to read the number to build a wa.me link, no session required."
        whatsappSettings: WhatsappSettings!
    }
`;

export const adminApiExtensions = gql`
    ${whatsappTypes}

    extend type Query {
        whatsappSettings: WhatsappSettings!
    }

    extend type Mutation {
        updateWhatsappSettings(input: UpdateWhatsappSettingsInput!): WhatsappSettings!
    }
`;
