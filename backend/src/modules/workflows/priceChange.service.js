import { withTransaction } from "../../db/mongodb.js";
import { Product, ChangeRequest, User, Role, Notification, AuditLog } from "../../db/models.js";
import { HttpError } from "../../utils/httpError.js";

/**
 * Request price change (creates approval request)
 * Direct price edits are blocked; all changes must go through approval
 */
export async function requestPriceChange(input) {
  if (input.newPrice < 0) {
    throw new HttpError(400, "Price cannot be negative", "INVALID_PRICE");
  }

  return await withTransaction(async (session) => {
    // Get current product price
    const product = await Product.findOne({ _id: input.productId, isActive: true }).session(session);

    if (!product) {
      throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    const oldPrice = product.unitPrice;

    // Check if price is actually changing
    if (oldPrice === input.newPrice) {
      throw new HttpError(
        400,
        "New price is same as current price",
        "PRICE_UNCHANGED",
      );
    }

    // Create price change request using ChangeRequest model
    const [changeRequest] = await ChangeRequest.create([{
      entityType: 'product',
      entityId: input.productId,
      fieldName: 'unitPrice',
      oldValue: oldPrice,
      newValue: input.newPrice,
      reason: input.reason,
      requestedBy: input.userId,
      status: 'pending'
    }], { session });

    // Find admins to notify
    const adminRole = await Role.findOne({ name: 'admin' }).session(session);
    if (adminRole) {
      const admins = await User.find({ roles: adminRole._id, isActive: true }).session(session);
      
      const notifications = admins.map(admin => ({
        user: admin._id,
        type: 'price_change_request',
        title: 'Price Change Request',
        message: `Price change requested for product ${product.name}: ${oldPrice} → ${input.newPrice}`,
        referenceType: 'ChangeRequest',
        referenceId: changeRequest._id
      }));

      if (notifications.length > 0) {
        await Notification.insertMany(notifications, { session });
      }
    }

    // Return object with properties expected by controller
    return {
      id: changeRequest._id,
      product_id: changeRequest.entityId,
      old_price: changeRequest.oldValue,
      new_price: changeRequest.newValue,
      reason: changeRequest.reason,
      effective_date: null, // Not explicitly in schema but return as null
      requested_by: changeRequest.requestedBy,
      status: changeRequest.status,
      created_at: changeRequest.createdAt
    };
  });
}

/**
 * List pending price change requests
 */
export async function listPendingPriceChanges() {
  const requests = await ChangeRequest.find({
    entityType: 'product',
    fieldName: 'unitPrice',
    status: 'pending'
  }).sort({ createdAt: -1 }).lean();

  return requests.map(req => ({
    id: req._id,
    product_id: req.entityId,
    old_price: req.oldValue,
    new_price: req.newValue,
    reason: req.reason,
    effective_date: null,
    requested_by: req.requestedBy,
    status: req.status,
    created_at: req.createdAt
  }));
}

/**
 * Approve price change request
 */
export async function approvePriceChange(priceChangeRequestId, userId) {
  return await withTransaction(async (session) => {
    // Get price change request
    const changeRequest = await ChangeRequest.findById(priceChangeRequestId).session(session);

    if (!changeRequest) {
      throw new HttpError(
        404,
        "Price change request not found",
        "PRICE_CHANGE_NOT_FOUND",
      );
    }

    if (changeRequest.status !== "pending") {
      throw new HttpError(
        400,
        `Cannot approve request with status: ${changeRequest.status}`,
        "INVALID_STATUS",
      );
    }

    // Update product price
    const product = await Product.findByIdAndUpdate(
      changeRequest.entityId,
      { unitPrice: changeRequest.newValue },
      { session, returnDocument: "after" }
    );

    if (!product) {
      throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    // Update price change request status
    changeRequest.status = 'approved'; // Mapped 'applied' to 'approved' based on schema enum
    changeRequest.approvedBy = userId;
    changeRequest.approvedAt = new Date();
    await changeRequest.save({ session });

    // Notify requester
    await Notification.create([{
      user: changeRequest.requestedBy,
      type: 'price_change_approved',
      title: 'Price Change Approved',
      message: 'Your price change request has been approved and applied',
      referenceType: 'ChangeRequest',
      referenceId: changeRequest._id
    }], { session });

    // Log audit trail
    await AuditLog.create([{
      user: userId,
      action: 'price_change_approved',
      entityType: 'product',
      entityId: changeRequest.entityId,
      newValues: { unitPrice: changeRequest.newValue },
      status: 'success'
    }], { session });

    return {
      id: changeRequest._id,
      product_id: changeRequest.entityId,
      old_price: changeRequest.oldValue,
      new_price: changeRequest.newValue,
      reason: changeRequest.reason,
      effective_date: null,
      requested_by: changeRequest.requestedBy,
      status: 'applied', // Return 'applied' for compatibility with controller
      created_at: changeRequest.createdAt
    };
  });
}

/**
 * Reject price change request
 */
export async function rejectPriceChange(
  priceChangeRequestId,
  rejectionReason,
  userId,
) {
  if (!rejectionReason || rejectionReason.trim().length === 0) {
    throw new HttpError(400, "Rejection reason is required", "MISSING_REASON");
  }

  return await withTransaction(async (session) => {
    // Get price change request
    const changeRequest = await ChangeRequest.findById(priceChangeRequestId).session(session);

    if (!changeRequest) {
      throw new HttpError(
        404,
        "Price change request not found",
        "PRICE_CHANGE_NOT_FOUND",
      );
    }

    if (changeRequest.status !== "pending") {
      throw new HttpError(
        400,
        `Cannot reject request with status: ${changeRequest.status}`,
        "INVALID_STATUS",
      );
    }

    // Update price change request status
    changeRequest.status = 'rejected';
    changeRequest.rejectedBy = userId;
    changeRequest.rejectedAt = new Date();
    changeRequest.rejectionReason = rejectionReason;
    await changeRequest.save({ session });

    // Notify requester
    await Notification.create([{
      user: changeRequest.requestedBy,
      type: 'price_change_rejected',
      title: 'Price Change Rejected',
      message: `Your price change request has been rejected. Reason: ${rejectionReason}`,
      referenceType: 'ChangeRequest',
      referenceId: changeRequest._id
    }], { session });

    return {
      id: changeRequest._id,
      product_id: changeRequest.entityId,
      old_price: changeRequest.oldValue,
      new_price: changeRequest.newValue,
      reason: changeRequest.reason,
      effective_date: null,
      requested_by: changeRequest.requestedBy,
      status: changeRequest.status,
      created_at: changeRequest.createdAt
    };
  });
}

/**
 * Block direct price edits
 * This function is called when someone tries to directly update product price
 */
export function blockDirectPriceEdit() {
  throw new HttpError(
    403,
    "Direct price edits are not allowed. Use the price change request workflow.",
    "PRICE_EDIT_BLOCKED",
  );
}
