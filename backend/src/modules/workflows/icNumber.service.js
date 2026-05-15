import { withTransaction } from "../../db/mongodb.js";
import { Product, Sale, ChangeRequest, AuditLog, Role, User, Notification } from "../../db/models.js";
import { HttpError } from "../../utils/httpError.js";

/**
 * Capture IC number during sales/cashier flow
 * Once captured, IC number is locked and cannot be directly edited
 */
export async function captureIcNumber(input) {
  if (!input.icNumber || input.icNumber.trim().length === 0) {
    throw new HttpError(400, "IC number cannot be empty", "INVALID_IC_NUMBER");
  }

  return await withTransaction(async (session) => {
    let updatedEntity;

    if (input.entityType === "sale") {
      updatedEntity = await Sale.findByIdAndUpdate(
        input.entityId,
        { icNumber: input.icNumber, icLocked: true },
        { session, new: true }
      );
      if (!updatedEntity) {
        throw new HttpError(404, "Sale not found", "SALE_NOT_FOUND");
      }
    } else if (input.entityType === "product") {
      updatedEntity = await Product.findByIdAndUpdate(
        input.entityId,
        { icNumber: input.icNumber, icLocked: true },
        { session, new: true }
      );
      if (!updatedEntity) {
        throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }
    } else {
      throw new HttpError(400, "Invalid entity type", "INVALID_ENTITY_TYPE");
    }

    // Log audit trail
    await AuditLog.create([{
      user: input.userId,
      action: 'ic_number_captured',
      entityType: input.entityType,
      entityId: input.entityId,
      newValues: { ic_number: input.icNumber },
      status: 'success'
    }], { session });

    return {
      id: updatedEntity._id,
      ic_number: updatedEntity.icNumber,
      ic_locked: updatedEntity.icLocked
    };
  });
}

/**
 * Request IC number change (creates approval request)
 * Manager/Admin cannot directly edit IC number; must go through approval
 */
export async function requestIcNumberChange(input) {
  if (!input.newIcNumber || input.newIcNumber.trim().length === 0) {
    throw new HttpError(
      400,
      "New IC number cannot be empty",
      "INVALID_IC_NUMBER",
    );
  }

  return await withTransaction(async (session) => {
    let oldValue = null;

    // Get current IC number
    if (input.entityType === "sale") {
      const sale = await Sale.findById(input.entityId).session(session);
      if (!sale) throw new HttpError(404, "Sale not found", "SALE_NOT_FOUND");
      oldValue = sale.icNumber || null;
    } else if (input.entityType === "product") {
      const product = await Product.findById(input.entityId).session(session);
      if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
      oldValue = product.icNumber || null;
    } else {
      throw new HttpError(400, "Invalid entity type", "INVALID_ENTITY_TYPE");
    }

    // Create change request
    const [changeRequest] = await ChangeRequest.create([{
      entityType: input.entityType,
      entityId: input.entityId,
      fieldName: 'icNumber',
      oldValue: oldValue,
      newValue: input.newIcNumber,
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
        type: 'change_request',
        title: 'IC Number Change Request',
        message: `IC number change requested for ${input.entityType} (ID: ${input.entityId})`,
        referenceType: 'ChangeRequest',
        referenceId: changeRequest._id
      }));

      if (notifications.length > 0) {
        await Notification.insertMany(notifications, { session });
      }
    }

    return {
      id: changeRequest._id,
      entity_type: changeRequest.entityType,
      entity_id: changeRequest.entityId,
      field_name: changeRequest.fieldName,
      old_value: changeRequest.oldValue,
      new_value: changeRequest.newValue,
      status: changeRequest.status,
      created_at: changeRequest.createdAt
    };
  });
}

/**
 * Check if IC number is locked for an entity
 */
export async function isIcNumberLocked(entityType, entityId) {
  let entity;
  if (entityType === "sale") {
    entity = await Sale.findById(entityId).select('icLocked').lean();
  } else if (entityType === "product") {
    entity = await Product.findById(entityId).select('icLocked').lean();
  } else {
    throw new HttpError(400, "Invalid entity type", "INVALID_ENTITY_TYPE");
  }

  if (!entity) {
    throw new HttpError(
      404,
      `${entityType} not found`,
      `${entityType.toUpperCase()}_NOT_FOUND`,
    );
  }

  return entity.icLocked === true;
}
