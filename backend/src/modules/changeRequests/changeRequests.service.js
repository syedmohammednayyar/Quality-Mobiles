import { ChangeRequest, Notification, User, Role, Product, Customer, Buyback, Repair, StoreInventory } from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";

export async function createChangeRequest(input) {
  if (
    !["product", "inventory", "sale", "customer", "buyback", "repair"].includes(
      input.entityType,
    )
  ) {
    throw new HttpError(400, "Invalid entity type", "INVALID_ENTITY_TYPE");
  }

  return withTransaction(async (session) => {
    const [changeRequest] = await ChangeRequest.create([{
      entityType: input.entityType,
      entityId: input.entityId,
      fieldName: input.fieldName,
      oldValue: input.oldValue,
      newValue: input.newValue,
      reason: input.reason || null,
      requestedBy: input.userId,
      status: 'pending'
    }], { session });

    // Find admins to notify
    const admins = await User.find().populate('roles').session(session);
    const adminIds = admins.filter(u => u.roles.some(r => r.name === 'admin') && u.isActive).map(u => u._id);

    if (adminIds.length > 0) {
      const notifications = adminIds.map(adminId => ({
        user: adminId,
        type: 'change_request',
        title: 'New Change Request',
        message: `A new change request requires your attention for ${input.entityType} - ${input.fieldName}`,
        referenceType: 'change_request',
        referenceId: changeRequest._id
      }));
      await Notification.insertMany(notifications, { session });
    }

    return changeRequest.toObject();
  });
}

export async function listChangeRequests(filters, userId, userRoles) {
  const query = {};

  if (filters.status) query.status = filters.status;
  if (filters.entityType) query.entityType = filters.entityType;
  if (filters.requestedBy) query.requestedBy = filters.requestedBy;
  
  if (filters.fromDate || filters.toDate) {
    query.createdAt = {};
    if (filters.fromDate) query.createdAt.$gte = new Date(filters.fromDate);
    if (filters.toDate) query.createdAt.$lte = new Date(filters.toDate);
  }

  if (!userRoles.includes("admin")) {
    query.requestedBy = userId;
  }

  const changeRequests = await ChangeRequest.find(query)
    .populate('requestedBy', 'username')
    .populate('approvedBy', 'username')
    .populate('rejectedBy', 'username')
    .sort({ createdAt: -1 });

  return changeRequests.map(cr => {
    const obj = cr.toObject();
    obj.requested_by_name = cr.requestedBy ? cr.requestedBy.username : null;
    obj.approved_by_name = cr.approvedBy ? cr.approvedBy.username : null;
    obj.rejected_by_name = cr.rejectedBy ? cr.rejectedBy.username : null;
    return obj;
  });
}

export async function getChangeRequestById(id) {
  const cr = await ChangeRequest.findById(id)
    .populate('requestedBy', 'username')
    .populate('approvedBy', 'username')
    .populate('rejectedBy', 'username');
  
  if (!cr) return null;

  const obj = cr.toObject();
  obj.requested_by_name = cr.requestedBy ? cr.requestedBy.username : null;
  obj.approved_by_name = cr.approvedBy ? cr.approvedBy.username : null;
  obj.rejected_by_name = cr.rejectedBy ? cr.rejectedBy.username : null;
  return obj;
}

export async function approveChangeRequest(id, approverUserId, userRoles) {
  if (!userRoles.includes("admin")) {
    throw new HttpError(
      403,
      "Only admins can approve change requests",
      "FORBIDDEN",
    );
  }

  return withTransaction(async (session) => {
    const request = await ChangeRequest.findById(id).session(session);
    if (!request) {
      throw new HttpError(404, "Change request not found", "NOT_FOUND");
    }

    if (request.status !== "pending") {
      throw new HttpError(
        400,
        "Change request is not pending",
        "INVALID_STATUS",
      );
    }

    await applyChange(request, session);

    request.status = 'approved';
    request.approvedBy = approverUserId;
    request.approvedAt = new Date();
    await request.save({ session });

    await Notification.create([{
      user: request.requestedBy,
      type: 'change_approved',
      title: 'Request Approved',
      message: 'Your change request has been approved',
      referenceType: 'change_request',
      referenceId: id
    }], { session });

    return request.toObject();
  });
}

export async function rejectChangeRequest(
  id,
  rejecterUserId,
  rejectionReason,
  userRoles,
) {
  if (!userRoles.includes("admin")) {
    throw new HttpError(
      403,
      "Only admins can reject change requests",
      "FORBIDDEN",
    );
  }

  return withTransaction(async (session) => {
    const request = await ChangeRequest.findById(id).session(session);
    if (!request) {
      throw new HttpError(404, "Change request not found", "NOT_FOUND");
    }

    if (request.status !== "pending") {
      throw new HttpError(
        400,
        "Change request is not pending",
        "INVALID_STATUS",
      );
    }

    request.status = 'rejected';
    request.rejectedBy = rejecterUserId;
    request.rejectedAt = new Date();
    request.rejectionReason = rejectionReason;
    await request.save({ session });

    await Notification.create([{
      user: request.requestedBy,
      type: 'change_rejected',
      title: 'Request Rejected',
      message: `Your change request has been rejected: ${rejectionReason}`,
      referenceType: 'change_request',
      referenceId: id
    }], { session });

    return request.toObject();
  });
}

async function applyChange(request, session) {
  const { entityType, entityId, fieldName, newValue } = request;

  switch (entityType) {
    case "product":
      await Product.findByIdAndUpdate(entityId, { [fieldName]: newValue }, { session });
      break;
    case "customer":
      await Customer.findByIdAndUpdate(entityId, { [fieldName]: newValue }, { session });
      break;
    case "buyback":
      await Buyback.findByIdAndUpdate(entityId, { [fieldName]: newValue }, { session });
      break;
    case "repair":
      await Repair.findByIdAndUpdate(entityId, { [fieldName]: newValue }, { session });
      break;
    case "inventory":
      if (fieldName === "quantity") {
        let storeId = null;
        let productId = String(entityId);

        if (String(entityId).includes(":")) {
          const parts = String(entityId).split(":");
          storeId = parts[0];
          productId = parts[1];
        }

        if (storeId) {
          await StoreInventory.findOneAndUpdate(
            { store: storeId, "items.product": productId },
            { $set: { "items.$.quantity": newValue } },
            { session }
          );
        } else {
          await StoreInventory.updateMany(
            { "items.product": productId },
            { $set: { "items.$.quantity": newValue } },
            { session }
          );
        }
      }
      break;
    default:
      throw new HttpError(
        400,
        `Cannot apply changes for entity type: ${entityType}`,
        "INVALID_ENTITY_TYPE",
      );
  }
}

export async function getPendingCount() {
  return await ChangeRequest.countDocuments({ status: 'pending' });
}
