import { withTransaction } from "../../db/mongodb.js";
import { StoreManagerAssignment, Sale, AuditLog } from "../../db/models.js";

/**
 * Check if data is visible based on T+1 rule
 * Rules:
 * - Store Manager: Can only view their store data, visible only after T+1
 * - Admin: Can view all stores, visible only after T+1 (can override)
 * - Data visible only if transaction_date < CURRENT_DATE
 */
export async function checkCashVisibility(context, transactionDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const txDate = new Date(transactionDate);
  txDate.setHours(0, 0, 0, 0);

  const isAdmin = context.userRoles.includes("admin");
  const isManager = context.userRoles.includes("manager");

  // Admin can override T+1 restriction
  if (isAdmin) {
    return {
      isVisible: txDate < today,
      reason:
        txDate < today
          ? "Data is visible (T+1 rule satisfied)"
          : "Data is from today (T+0), not visible without override",
      overrideAllowed: true,
    };
  }

  // Manager can only see their store data after T+1
  if (isManager) {
    if (!context.storeId) {
      return {
        isVisible: false,
        reason: "Store ID is required for manager visibility check",
        overrideAllowed: false,
      };
    }

    // Verify manager is assigned to this store
    const storeAssignment = await StoreManagerAssignment.findOne({
      user: context.userId,
      store: context.storeId,
      isActive: true
    });

    if (!storeAssignment) {
      return {
        isVisible: false,
        reason: "Manager is not assigned to this store",
        overrideAllowed: false,
      };
    }

    return {
      isVisible: txDate < today,
      reason:
        txDate < today
          ? "Data is visible (T+1 rule satisfied)"
          : "Data is from today (T+0), not visible",
      overrideAllowed: false,
    };
  }

  // Other roles cannot view cash data
  return {
    isVisible: false,
    reason: "User role does not have access to cash data",
    overrideAllowed: false,
  };
}

/**
 * Apply T+1 filter to sales query
 * Returns Mongoose match object
 */
export function getT1FilterCondition(userRoles, storeId, overrideT1 = false) {
  const isAdmin = userRoles.includes("admin");
  const isManager = userRoles.includes("manager");

  if (!isAdmin && !isManager) {
    // Non-privileged users cannot see cash data
    return { $expr: { $eq: [0, 1] } };
  }

  if (isAdmin && overrideT1) {
    // Admin can override T+1 restriction
    return {};
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const t1Condition = { transactionDate: { $lt: today } };

  if (isManager && storeId) {
    return {
      store: storeId,
      ...t1Condition
    };
  }

  if (isAdmin) {
    return t1Condition;
  }

  return { $expr: { $eq: [0, 1] } };
}

/**
 * Log T+1 override for audit trail
 */
export async function logT1Override(userId, storeId, dateRange) {
  await withTransaction(async (session) => {
    await AuditLog.create([{
      user: userId,
      action: 't1_override',
      entityType: 'sales',
      newValues: {
        storeId,
        dateRange,
        timestamp: new Date().toISOString(),
      },
      status: 'success'
    }], { session });
  });
}

/**
 * Get sales summary with T+1 filter applied
 */
export async function getSalesSummaryWithT1Filter(
  userRoles,
  storeId,
  fromDate,
  toDate,
  overrideT1 = false,
) {
  const filter = getT1FilterCondition(
    userRoles,
    storeId,
    overrideT1,
  );

  if (fromDate || toDate) {
    filter.createdAt = filter.createdAt || {};
    if (fromDate) {
      filter.createdAt.$gte = new Date(fromDate);
    }
    if (toDate) {
      const d = new Date(toDate);
      d.setDate(d.getDate() + 1);
      filter.createdAt.$lt = d;
    }
  }

  const result = await Sale.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        total_sales: { $sum: "$grandTotal" },
        total_items: { $sum: { $size: "$items" } },
        total_transactions: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        total_sales: 1,
        total_items: 1,
        total_transactions: 1,
        average_transaction: {
          $cond: [
            { $eq: ["$total_transactions", 0] },
            0,
            { $divide: ["$total_sales", "$total_transactions"] }
          ]
        }
      }
    }
  ]);

  return result[0] || {
    total_sales: 0,
    total_items: 0,
    total_transactions: 0,
    average_transaction: 0
  };
}

/**
 * Validate T+1 access for a specific date
 */
export function validateT1Access(userRoles, targetDate, overrideT1 = false) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const txDate = new Date(targetDate);
  txDate.setHours(0, 0, 0, 0);

  const isAdmin = userRoles.includes("admin");
  const isManager = userRoles.includes("manager");

  if (!isAdmin && !isManager) {
    return {
      allowed: false,
      message: "User role does not have access to cash data",
    };
  }

  if (txDate >= today) {
    // Trying to access today's data
    if (isAdmin && overrideT1) {
      return {
        allowed: true,
        message: "Admin override applied for T+0 data access",
      };
    }

    return {
      allowed: false,
      message:
        "Data from today (T+0) is not visible. Data becomes visible after T+1 (next day).",
    };
  }

  return {
    allowed: true,
    message: "Data is visible (T+1 rule satisfied)",
  };
}
