import { AuditLog } from "../db/models.js";

/**
 * Append-only audit log. Never update or delete entries.
 * @param {Object} params
 * @param {string} params.action  - e.g. 'sale_created', 'price_adjusted'
 * @param {string} params.entityType
 * @param {*}      params.entityId
 * @param {Object} [params.ctx]   - { userId, employeeId, storeId }
 * @param {string} [params.fieldName]
 * @param {*}      [params.oldValue]
 * @param {*}      [params.newValue]
 * @param {Object} [params.metadata] - arbitrary extra context
 */
export async function writeAudit({ action, entityType, entityId, ctx = {}, fieldName, oldValue, newValue, metadata } = {}) {
  try {
    await AuditLog.create({
      user:       ctx.userId   || null,
      employee:   ctx.employeeId || null,
      store:      ctx.storeId  || null,
      action,
      entityType,
      entityId,
      fieldName:  fieldName || null,
      oldValue:   oldValue  ?? null,
      newValue:   newValue  ?? null,
      metadata:   metadata  || null,
      status:     'success',
    });
  } catch {
    // Audit failure must never crash the main flow
  }
}
