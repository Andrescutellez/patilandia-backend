import gql from 'graphql-tag';

const petProfileTypes = gql`
  type PetProfile implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    name: String!
    species: String!
    breed: String!
    birthDate: DateTime
    sizeLabel: String!
    notes: String!
    customer: Customer!
  }

  input CreatePetProfileInput {
    "Only used for a guest (no session) caller — ignored when logged in."
    customerEmail: String
    customerFirstName: String
    customerLastName: String
    name: String!
    species: String!
    breed: String
    birthDate: DateTime
    sizeLabel: String
    notes: String
  }

  input UpdatePetProfileInput {
    id: ID!
    "Only used for a guest (no session) caller — ignored when logged in."
    customerEmail: String
    name: String
    species: String
    breed: String
    birthDate: DateTime
    sizeLabel: String
    notes: String
  }
`;

export const shopApiExtensions = gql`
  ${petProfileTypes}

  extend type Query {
    "Uses the logged-in session when there is one; otherwise falls back to customerEmail for guests."
    myPetProfiles(customerEmail: String): [PetProfile!]!
  }

  extend type Mutation {
    createPetProfile(input: CreatePetProfileInput!): PetProfile!
    updatePetProfile(input: UpdatePetProfileInput!): PetProfile!
    deletePetProfile(id: ID!, customerEmail: String): Boolean!
  }
`;

export const adminApiExtensions = gql`
  ${petProfileTypes}

  extend type Query {
    "Every pet profile, for support/context — there's no moderation concept here, only the owner ever writes this data."
    petProfiles: [PetProfile!]!
  }

  extend type Mutation {
    adminDeletePetProfile(id: ID!): Boolean!
  }
`;
