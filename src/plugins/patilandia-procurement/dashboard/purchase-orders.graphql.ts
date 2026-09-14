import gql from 'graphql-tag';

const PURCHASE_ORDER_LINE_FIELDS = `
  id
  quantityOrdered
  quantityReceived
  unitCostMinorUnits
  subtotalMinorUnits
  productVariant { id name sku }
`;

export const purchaseOrderListQuery = gql`
    query PatilandiaPurchaseOrderList {
        purchaseOrders {
            items {
                id
                createdAt
                status
                orderDate
                totalMinorUnits
                supplier { id name }
            }
            totalItems
        }
    }
`;

export const purchaseOrderDetailDocument = gql`
    query PatilandiaPurchaseOrderDetail($id: ID!) {
        purchaseOrder(id: $id) {
            id
            status
            orderDate
            notes
            totalMinorUnits
            supplier { id name }
            lines { ${PURCHASE_ORDER_LINE_FIELDS} }
        }
    }
`;

export const suppliersForSelectQuery = gql`
    query PatilandiaSuppliersForSelect {
        suppliers {
            items {
                id
                name
                active
            }
        }
    }
`;

export const supplierProductVariantsForPOQuery = gql`
    query PatilandiaSupplierProductVariantsForPO($supplierId: ID!) {
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

export const createPurchaseOrderDocument = gql`
    mutation CreatePatilandiaPurchaseOrder($input: CreatePurchaseOrderInput!) {
        createPurchaseOrder(input: $input) {
            id
        }
    }
`;

export const updatePurchaseOrderDocument = gql`
    mutation UpdatePatilandiaPurchaseOrder($input: UpdatePurchaseOrderInput!) {
        updatePurchaseOrder(input: $input) {
            id
        }
    }
`;

export const sendPurchaseOrderDocument = gql`
    mutation SendPatilandiaPurchaseOrder($id: ID!) {
        sendPurchaseOrder(id: $id) {
            id
            status
        }
    }
`;

export const receiveGoodsDocument = gql`
    mutation ReceivePatilandiaGoods($input: ReceiveGoodsInput!) {
        receiveGoods(input: $input) {
            id
            status
            lines { ${PURCHASE_ORDER_LINE_FIELDS} }
        }
    }
`;
