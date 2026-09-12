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
    customerEmail: String!
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
    customerEmail: String!
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
    "No login required — identified by email only, same trust level as the rest of the storefront."
    myPetProfiles(customerEmail: String!): [PetProfile!]!
  }

  extend type Mutation {
    createPetProfile(input: CreatePetProfileInput!): PetProfile!
    updatePetProfile(input: UpdatePetProfileInput!): PetProfile!
    deletePetProfile(id: ID!, customerEmail: String!): Boolean!
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
