import gql from 'graphql-tag';

const procurementTypes = gql`
    enum SourcingType {
        INVENTARIO_PROPIO
        DROPSHIPPING
    }

    enum PurchaseOrderStatus {
        BORRADOR
        ENVIADA
        PARCIALMENTE_RECIBIDA
        RECIBIDA
    }

    type Supplier implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        name: String!
        contactName: String!
        phone: String!
        whatsapp: String!
        email: String!
        address: String!
        notes: String!
        active: Boolean!
        productVariants: [SupplierProductVariant!]!
    }

    """
    A deliberately simple, unpaginated list shape — see the plugin's PurchaseOrderService doc
    comment for why: neither the supplier nor the purchase order catalogs are expected to be large
    enough yet to need real server-side pagination/sort/filter.
    """
    type SupplierList {
        items: [Supplier!]!
        totalItems: Int!
    }

    type SupplierProductVariant implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        supplier: Supplier!
        productVariant: ProductVariant!
        supplierSku: String!
        sourcingType: SourcingType!
        currentCostMinorUnits: Int!
    }

    input CreateSupplierInput {
        name: String!
        contactName: String
        phone: String
        whatsapp: String
        email: String
        address: String
        notes: String
        active: Boolean
    }

    input UpdateSupplierInput {
        id: ID!
        name: String
        contactName: String
        phone: String
        whatsapp: String
        email: String
        address: String
        notes: String
        active: Boolean
    }

    input CreateSupplierProductVariantInput {
        supplierId: ID!
        productVariantId: ID!
        supplierSku: String
        sourcingType: SourcingType!
        currentCostMinorUnits: Int
    }

    input UpdateSupplierProductVariantInput {
        id: ID!
        supplierSku: String
        sourcingType: SourcingType
        currentCostMinorUnits: Int
    }

    type PurchaseOrder implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        supplier: Supplier!
        status: PurchaseOrderStatus!
        orderDate: DateTime!
        notes: String!
        lines: [PurchaseOrderLine!]!
        totalMinorUnits: Int!
    }

    type PurchaseOrderList {
        items: [PurchaseOrder!]!
        totalItems: Int!
    }

    type PurchaseOrderLine implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        productVariant: ProductVariant!
        quantityOrdered: Int!
        quantityReceived: Int!
        unitCostMinorUnits: Int!
        subtotalMinorUnits: Int!
    }

    input PurchaseOrderLineInput {
        productVariantId: ID!
        quantityOrdered: Int!
        unitCostMinorUnits: Int!
    }

    input CreatePurchaseOrderInput {
        supplierId: ID!
        orderDate: DateTime!
        notes: String
        lines: [PurchaseOrderLineInput!]!
    }

    input UpdatePurchaseOrderInput {
        id: ID!
        orderDate: DateTime
        notes: String
        lines: [PurchaseOrderLineInput!]
    }

    input ReceiveGoodsLineInput {
        purchaseOrderLineId: ID!
        quantityReceived: Int!
    }

    """
    idempotencyKey must be generated once by the caller (e.g. a UUID) and reused only when
    retrying the exact same receipt — see PurchaseOrderService.receiveGoods.
    """
    input ReceiveGoodsInput {
        purchaseOrderId: ID!
        idempotencyKey: String!
        lines: [ReceiveGoodsLineInput!]!
    }
`;

export const adminApiExtensions = gql`
    ${procurementTypes}

    extend type Query {
        suppliers: SupplierList!
        supplier(id: ID!): Supplier
        supplierProductVariants(supplierId: ID!): [SupplierProductVariant!]!
        purchaseOrders: PurchaseOrderList!
        purchaseOrder(id: ID!): PurchaseOrder
    }

    extend type Mutation {
        createSupplier(input: CreateSupplierInput!): Supplier!
        updateSupplier(input: UpdateSupplierInput!): Supplier!
        deleteSupplier(id: ID!): Boolean!

        createSupplierProductVariant(input: CreateSupplierProductVariantInput!): SupplierProductVariant!
        updateSupplierProductVariant(input: UpdateSupplierProductVariantInput!): SupplierProductVariant!
        deleteSupplierProductVariant(id: ID!): Boolean!

        createPurchaseOrder(input: CreatePurchaseOrderInput!): PurchaseOrder!
        updatePurchaseOrder(input: UpdatePurchaseOrderInput!): PurchaseOrder!
        sendPurchaseOrder(id: ID!): PurchaseOrder!
        receiveGoods(input: ReceiveGoodsInput!): PurchaseOrder!
    }
`;
