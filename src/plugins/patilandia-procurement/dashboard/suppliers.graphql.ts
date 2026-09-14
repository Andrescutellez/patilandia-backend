import gql from 'graphql-tag';

export const supplierListQuery = gql`
    query PatilandiaSupplierList {
        suppliers {
            items {
                id
                createdAt
                updatedAt
                name
                contactName
                phone
                email
                active
            }
            totalItems
        }
    }
`;

export const supplierDetailDocument = gql`
    query PatilandiaSupplierDetail($id: ID!) {
        supplier(id: $id) {
            id
            name
            contactName
            phone
            whatsapp
            email
            address
            notes
            active
        }
    }
`;

export const createSupplierDocument = gql`
    mutation CreatePatilandiaSupplier($input: CreateSupplierInput!) {
        createSupplier(input: $input) {
            id
        }
    }
`;

export const updateSupplierDocument = gql`
    mutation UpdatePatilandiaSupplier($input: UpdateSupplierInput!) {
        updateSupplier(input: $input) {
            id
        }
    }
`;

export const deleteSupplierDocument = gql`
    mutation DeletePatilandiaSupplier($id: ID!) {
        deleteSupplier(id: $id)
    }
`;

export const supplierProductVariantsQuery = gql`
    query PatilandiaSupplierProductVariants($supplierId: ID!) {
        supplierProductVariants(supplierId: $supplierId) {
            id
            supplierSku
            sourcingType
            currentCostMinorUnits
            productVariant {
                id
                name
                sku
            }
        }
    }
`;

export const createSupplierProductVariantDocument = gql`
    mutation CreatePatilandiaSupplierProductVariant($input: CreateSupplierProductVariantInput!) {
        createSupplierProductVariant(input: $input) {
            id
        }
    }
`;

export const updateSupplierProductVariantDocument = gql`
    mutation UpdatePatilandiaSupplierProductVariant($input: UpdateSupplierProductVariantInput!) {
        updateSupplierProductVariant(input: $input) {
            id
        }
    }
`;

export const deleteSupplierProductVariantDocument = gql`
    mutation DeletePatilandiaSupplierProductVariant($id: ID!) {
        deleteSupplierProductVariant(id: $id)
    }
`;

export const searchProductVariantsQuery = gql`
    query PatilandiaSearchProductVariants($term: String!) {
        search(input: { term: $term, take: 20, groupByProduct: false }) {
            items {
                productVariantId
                productVariantName
                sku
            }
        }
    }
`;
