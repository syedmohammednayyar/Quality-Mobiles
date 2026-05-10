import { withTransaction } from "../../db/mongodb.js";
import { Product, StoreInventory } from "../../db/models.js";
import { HttpError } from "../../utils/httpError.js";

/**
 * Link a job number to a product
 * Job numbers must be unique across the system
 */
export async function linkJobNumberToProduct(input) {
  if (!input.jobNumber || input.jobNumber.trim().length === 0) {
    throw new HttpError(
      400,
      "Job number cannot be empty",
      "INVALID_JOB_NUMBER",
    );
  }

  return await withTransaction(async (session) => {
    // Check if job number already exists
    const existingProduct = await Product.findOne({ 
      jobNumber: input.jobNumber, 
      _id: { $ne: input.productId } 
    }).session(session);

    if (existingProduct) {
      throw new HttpError(
        409,
        "Job number already linked to another product",
        "JOB_NUMBER_DUPLICATE",
      );
    }

    // Link job number to product
    const updatedProduct = await Product.findByIdAndUpdate(
      input.productId,
      { jobNumber: input.jobNumber },
      { session, new: true }
    );

    if (!updatedProduct) {
      throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    return {
      id: updatedProduct._id,
      sku: updatedProduct.sku,
      name: updatedProduct.name,
      category: updatedProduct.category,
      unit_price: updatedProduct.unitPrice,
      tax_rate: updatedProduct.taxRate,
      job_number: updatedProduct.jobNumber
    };
  });
}

/**
 * Fetch product by job number
 */
export async function getProductByJobNumber(jobNumber) {
  if (!jobNumber || jobNumber.trim().length === 0) {
    throw new HttpError(
      400,
      "Job number cannot be empty",
      "INVALID_JOB_NUMBER",
    );
  }

  const product = await Product.findOne({ 
    jobNumber: jobNumber, 
    isActive: true 
  }).lean();

  if (!product) return null;

  return {
    id: product._id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    unit_price: product.unitPrice,
    tax_rate: product.taxRate,
    job_number: product.jobNumber
  };
}

/**
 * Search inventory by job number across all stores
 */
export async function searchInventoryByJobNumber(jobNumber) {
  if (!jobNumber || jobNumber.trim().length === 0) {
    throw new HttpError(
      400,
      "Job number cannot be empty",
      "INVALID_JOB_NUMBER",
    );
  }

  // Find product(s) with this job number
  const products = await Product.find({ jobNumber, isActive: true }).select('_id').lean();
  const productIds = products.map(p => p._id);

  // Search in StoreInventory
  // In SQL: (si.job_number = $1 OR p.job_number = $1)
  const inventoryDocs = await StoreInventory.find({
    $or: [
      { "items.jobNumber": jobNumber },
      { "items.product": { $in: productIds } }
    ]
  }).lean();

  const results = [];
  for (const doc of inventoryDocs) {
    for (const item of doc.items) {
      if (item.jobNumber === jobNumber || productIds.some(id => id.equals(item.product))) {
        results.push({
          store_id: doc.store,
          product_id: item.product,
          quantity: item.quantity,
          reserved_quantity: item.reservedQuantity,
          job_number: item.jobNumber || jobNumber
        });
      }
    }
  }

  return results.sort((a, b) => String(a.store_id).localeCompare(String(b.store_id)));
}

/**
 * Unlink job number from product
 */
export async function unlinkJobNumber(productId) {
  return await withTransaction(async (session) => {
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      { $unset: { jobNumber: "" } },
      { session, new: true }
    );

    if (!updatedProduct) {
      throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    return {
      id: updatedProduct._id,
      sku: updatedProduct.sku,
      name: updatedProduct.name,
      category: updatedProduct.category,
      unit_price: updatedProduct.unitPrice,
      tax_rate: updatedProduct.taxRate,
      job_number: null
    };
  });
}
