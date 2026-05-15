import { withTransaction } from "../../db/mongodb.js";
import { Sale, Product, StoreInventory, ChangeRequest, User, ExportLog } from "../../db/models.js";

/**
 * Sanitize CSV value to prevent injection attacks
 * Escapes leading =, +, @, - characters
 */
export function sanitizeCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);

  // Escape formula injection characters
  if (stringValue.match(/^[=+@-]/)) {
    return "'" + stringValue;
  }

  // Escape quotes
  if (stringValue.includes('"')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }

  // Quote if contains comma or newline
  if (stringValue.includes(",") || stringValue.includes("\n")) {
    return '"' + stringValue + '"';
  }

  return stringValue;
}

/**
 * Export sales to CSV
 */
export async function exportSalesToCSV(filters, userId) {
  return await withTransaction(async (session) => {
    const query = {};

    if (filters.storeId) {
      query.store = filters.storeId;
    }

    if (filters.fromDate || filters.toDate) {
      query.createdAt = {};
      if (filters.fromDate) {
        query.createdAt.$gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        const toDate = new Date(filters.toDate);
        toDate.setDate(toDate.getDate() + 1);
        query.createdAt.$lt = toDate;
      }
    }

    const sales = await Sale.find(query).sort({ createdAt: -1 }).lean();

    // Log export
    await ExportLog.create([{
      user: userId,
      exportType: 'sales',
      format: 'csv',
      store: filters.storeId || null,
      filters: filters,
      rowCount: sales.length
    }], { session });

    const result = sales;

    // Build CSV
    const headers = [
      "Sale No",
      "Store ID",
      "Customer ID",
      "Employee ID",
      "Subtotal",
      "Tax Total",
      "Discount Total",
      "Grand Total",
      "Amount Paid",
      "Payment Status",
      "Created At",
      "Job Number",
      "IC Number",
    ];

    const rows = result.map((row) => [
      sanitizeCsvValue(row.saleNo),
      sanitizeCsvValue(row.store),
      sanitizeCsvValue(row.customer),
      sanitizeCsvValue(row.employee),
      sanitizeCsvValue(row.subtotal),
      sanitizeCsvValue(row.taxTotal),
      sanitizeCsvValue(row.discountTotal),
      sanitizeCsvValue(row.grandTotal),
      sanitizeCsvValue(row.amountPaid),
      sanitizeCsvValue(row.paymentStatus),
      sanitizeCsvValue(row.createdAt),
      sanitizeCsvValue(row.jobNumber),
      sanitizeCsvValue(row.icNumber),
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n",
    );

    return { csv, rowCount: result.length };
  });
}

/**
 * Export inventory to CSV
 */
export async function exportInventoryToCSV(filters, userId) {
  return await withTransaction(async (session) => {
    const query = {};
    if (filters.storeId) {
      query.store = filters.storeId;
    }

    const inventoryDocs = await StoreInventory.find(query)
      .populate({
        path: 'items.product',
        match: { isActive: true }
      })
      .lean();

    const flattenedInventory = [];
    for (const doc of inventoryDocs) {
      for (const item of doc.items) {
        if (item.product) {
          flattenedInventory.push({
            sku: item.product.sku,
            product_name: item.product.name,
            category: item.product.category,
            store_id: doc.store,
            quantity: item.quantity,
            reserved_quantity: item.reservedQuantity,
            unit_price: item.product.unitPrice,
            total_value: item.quantity * item.product.unitPrice,
            job_number: item.jobNumber || item.product.jobNumber
          });
        }
      }
    }

    flattenedInventory.sort((a, b) => a.product_name.localeCompare(b.product_name));

    // Log export
    await ExportLog.create([{
      user: userId,
      exportType: 'inventory',
      format: 'csv',
      store: filters.storeId || null,
      filters: filters,
      rowCount: flattenedInventory.length
    }], { session });

    const result = flattenedInventory;

    // Build CSV
    const headers = [
      "SKU",
      "Product Name",
      "Category",
      "Store ID",
      "Quantity",
      "Reserved Quantity",
      "Unit Price",
      "Total Value",
      "Job Number",
    ];

    const rows = result.map((row) => [
      sanitizeCsvValue(row.sku),
      sanitizeCsvValue(row.product_name),
      sanitizeCsvValue(row.category),
      sanitizeCsvValue(row.store_id),
      sanitizeCsvValue(String(row.quantity)),
      sanitizeCsvValue(String(row.reserved_quantity)),
      sanitizeCsvValue(row.unit_price),
      sanitizeCsvValue(row.total_value),
      sanitizeCsvValue(row.job_number),
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n",
    );

    return { csv, rowCount: result.length };
  });
}

export async function exportInventoryRows(filters, userId) {
  return await withTransaction(async (session) => {
    const query = {};
    if (filters.storeId) {
      query.store = filters.storeId;
    }

    const inventoryDocs = await StoreInventory.find(query)
      .populate({
        path: 'items.product',
        match: { isActive: true }
      })
      .lean();

    const flattenedInventory = [];
    for (const doc of inventoryDocs) {
      for (const item of doc.items) {
        if (item.product) {
          flattenedInventory.push({
            sku: item.product.sku,
            product_name: item.product.name,
            category: item.product.category,
            store_id: doc.store,
            quantity: item.quantity,
            reserved_quantity: item.reservedQuantity,
            unit_price: item.product.unitPrice,
            total_value: item.quantity * item.product.unitPrice,
            job_number: item.jobNumber || item.product.jobNumber
          });
        }
      }
    }

    flattenedInventory.sort((a, b) => a.product_name.localeCompare(b.product_name));

    // Log export (pdf)
    await ExportLog.create([{
      user: userId,
      exportType: 'inventory',
      format: 'pdf',
      store: filters.storeId || null,
      filters: filters,
      rowCount: flattenedInventory.length
    }], { session });

    return flattenedInventory;
  });
}

/**
 * Export change requests to CSV (audit trail)
 */
export async function exportChangeRequestsToCSV(filters, userId) {
  return await withTransaction(async (session) => {
    const query = {};
    if (filters.fromDate || filters.toDate) {
      query.createdAt = {};
      if (filters.fromDate) {
        query.createdAt.$gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        const toDate = new Date(filters.toDate);
        toDate.setDate(toDate.getDate() + 1);
        query.createdAt.$lt = toDate;
      }
    }

    const changeRequests = await ChangeRequest.find(query)
      .populate('requestedBy', 'username')
      .populate('approvedBy', 'username')
      .sort({ createdAt: -1 })
      .lean();

    // Log export
    await ExportLog.create([{
      user: userId,
      exportType: 'change_requests',
      format: 'csv',
      filters: filters,
      rowCount: changeRequests.length
    }], { session });

    const result = changeRequests;

    // Build CSV
    const headers = [
      "ID",
      "Entity Type",
      "Entity ID",
      "Field Name",
      "Old Value",
      "New Value",
      "Status",
      "Requested By",
      "Approved By",
      "Created At",
    ];

    const rows = result.map((row) => [
      sanitizeCsvValue(row._id),
      sanitizeCsvValue(row.entityType),
      sanitizeCsvValue(row.entityId),
      sanitizeCsvValue(row.fieldName),
      sanitizeCsvValue(row.oldValue),
      sanitizeCsvValue(row.newValue),
      sanitizeCsvValue(row.status),
      sanitizeCsvValue(row.requestedBy?.username),
      sanitizeCsvValue(row.approvedBy?.username),
      sanitizeCsvValue(row.createdAt),
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n",
    );

    return { csv, rowCount: result.length };
  });
}

/**
 * Get export history for audit
 */
export async function getExportHistory(userId, limit = 100) {
  const query = {};
  if (userId) {
    query.user = userId;
  }

  const logs = await ExportLog.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return logs.map(log => ({
    id: log._id,
    user_id: log.user,
    export_type: log.exportType,
    format: log.format,
    row_count: log.rowCount,
    created_at: log.createdAt
  }));
}
