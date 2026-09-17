import gql from 'graphql-tag';

export const shopApiExtensions = gql`
    type BoldCheckoutData {
        apiKey: String!
        orderId: String!
        amount: Int!
        currency: String!
        signature: String!
        redirectionUrl: String!
    }

    type BoldPaymentStatus {
        orderCode: String!
        status: String!
        orderSettled: Boolean!
    }

    extend type Mutation {
        "Prepares the active order for a Bold payment (transitions it to ArrangingPayment) and returns everything needed to render Bold's Payment Button — never exposes the secret key."
        generateBoldCheckout: BoldCheckoutData!
    }

    extend type Query {
        "Actively checks Bold for this order's real payment status and settles it server-side if approved — used by the confirmation page, never trusts the redirect query params alone."
        boldPaymentStatus(orderCode: String!): BoldPaymentStatus!
    }
`;
