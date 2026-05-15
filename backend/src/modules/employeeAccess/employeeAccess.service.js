import {
  AuditLog,
  Employee,
  EmployeeCredential,
  EmployeeStoreAssignment,
  Role,
  SignupRequest,
  Store,
  User,
} from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";

function isAdmin(auth) {
  return Boolean(auth?.roles?.includes("admin"));
}

function isManager(auth) {
  return Boolean(auth?.roles?.includes("manager"));
}

async function getActorEmployee(auth) {
  if (!auth?.userId) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
  return Employee.findOne({ user: auth.userId, isActive: true });
}

async function getManagedStoreIds(auth) {
  if (isAdmin(auth)) return null;
  if (!isManager(auth)) throw new HttpError(403, "Forbidden", "AUTH_FORBIDDEN");

  const actorEmployee = await getActorEmployee(auth);
  if (!actorEmployee) {
    throw new HttpError(403, "Manager employee profile not found", "EMPLOYEE_NOT_FOUND");
  }

  const assignments = await EmployeeStoreAssignment.find({
    employee: actorEmployee._id,
    role: "manager",
    status: "active",
  }).select("store");

  return assignments.map((a) => String(a.store));
}

async function assertStoreManagePermission(auth, storeId) {
  if (isAdmin(auth)) return;
  const managedStoreIds = await getManagedStoreIds(auth);
  if (!managedStoreIds.includes(String(storeId))) {
    throw new HttpError(403, "Manager can only manage assigned stores", "STORE_ACCESS_DENIED");
  }
}

function mapSignupRequest(doc) {
  return {
    id: doc._id.toString(),
    employee_id: doc.employee ? doc.employee._id?.toString?.() || doc.employee.toString() : null,
    employee_name: doc.employeeName,
    email: doc.email,
    phone: doc.phone || "",
    requested_role: doc.requestedRole,
    requested_store_ref: doc.requestedStore?._id?.toString?.() || doc.requestedStore?.toString?.() || null,
    requested_store_name: doc.requestedStore?.name || "",
    request_status: doc.requestStatus,
    reviewed_by: doc.reviewedBy ? doc.reviewedBy.toString() : null,
    reviewed_at: doc.reviewedAt || null,
    rejection_reason: doc.rejectionReason || "",
    created_at: doc.createdAt,
  };
}

function mapCredential(doc) {
  return {
    id: doc._id.toString(),
    employee_id: doc.employee?._id?.toString?.() || doc.employee?.toString?.() || null,
    employee_name: doc.employee?.fullName || "",
    email: doc.email,
    status: doc.status,
    approval_status: doc.approvalStatus,
    account_locked: doc.accountLocked === true,
    login_attempts: Number(doc.loginAttempts || 0),
    last_login: doc.lastLogin || null,
    approved_by: doc.approvedBy ? doc.approvedBy.toString() : null,
    approved_at: doc.approvedAt || null,
    rejected_reason: doc.rejectedReason || "",
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  };
}

export async function listSignupRequests(auth, input = {}) {
  const query = {};
  if (input.status) query.requestStatus = input.status;
  if (input.storeId) query.requestedStore = input.storeId;

  if (!isAdmin(auth)) {
    const managedStoreIds = await getManagedStoreIds(auth);
    query.requestedStore = input.storeId
      ? input.storeId
      : { $in: managedStoreIds };
    if (input.storeId && !managedStoreIds.includes(String(input.storeId))) {
      throw new HttpError(403, "Manager can only view requests for assigned stores", "STORE_ACCESS_DENIED");
    }
  }

  const rows = await SignupRequest.find(query)
    .populate("requestedStore", "name code")
    .sort({ createdAt: -1 })
    .lean();
  return rows.map(mapSignupRequest);
}

export async function approveSignupRequest(auth, requestId, input = {}) {
  return withTransaction(async (session) => {
    const request = await SignupRequest.findById(requestId).session(session);
    if (!request) throw new HttpError(404, "Signup request not found", "REQUEST_NOT_FOUND");
    if (request.requestStatus !== "pending") {
      throw new HttpError(409, "Signup request already processed", "REQUEST_ALREADY_REVIEWED");
    }

    await assertStoreManagePermission(auth, request.requestedStore);
    if (isManager(auth) && request.requestedRole === "manager") {
      throw new HttpError(403, "Manager cannot approve manager-role requests", "MANAGER_ROLE_APPROVAL_DENIED");
    }

    const [user, employee, credential] = await Promise.all([
      User.findById(request.user).session(session),
      Employee.findById(request.employee).session(session),
      EmployeeCredential.findOne({ user: request.user }).session(session),
    ]);
    if (!user || !employee || !credential) {
      throw new HttpError(404, "Related signup entities not found", "REQUEST_ENTITY_MISSING");
    }

    const role = await Role.findOne({ name: request.requestedRole }).session(session);
    if (!role) throw new HttpError(500, "Requested role is not configured", "ROLE_NOT_CONFIGURED");

    user.roles = [role._id];
    user.isActive = true;
    await user.save({ session });

    employee.isActive = true;
    employee.store = request.requestedStore;
    await employee.save({ session });

    credential.approvalStatus = "approved";
    credential.status = input.status || "approved";
    credential.accountLocked = false;
    credential.loginAttempts = 0;
    credential.approvedBy = auth.userId;
    credential.approvedAt = new Date();
    credential.rejectedReason = null;
    await credential.save({ session });

    const assignmentRole = request.requestedRole === "manager" ? "manager" : "staff";
    await EmployeeStoreAssignment.updateOne(
      { employee: employee._id, store: request.requestedStore },
      {
        $set: {
          role: assignmentRole,
          status: "active",
          assignedBy: auth.userId,
          assignedAt: new Date(),
        },
      },
      { upsert: true, session },
    );

    request.requestStatus = "approved";
    request.reviewedBy = auth.userId;
    request.reviewedAt = new Date();
    request.rejectionReason = null;
    await request.save({ session });

    await AuditLog.create([{
      user: auth.userId,
      action: "employee_access.signup.approved",
      entityType: "signup_request",
      entityId: request._id.toString(),
      status: "success",
      notes: `Approved ${request.email} for store ${request.requestedStore.toString()}`,
    }], { session });

    return mapSignupRequest(await request.populate("requestedStore", "name code"));
  });
}

export async function rejectSignupRequest(auth, requestId, rejectionReason) {
  return withTransaction(async (session) => {
    const request = await SignupRequest.findById(requestId).session(session);
    if (!request) throw new HttpError(404, "Signup request not found", "REQUEST_NOT_FOUND");
    if (request.requestStatus !== "pending") {
      throw new HttpError(409, "Signup request already processed", "REQUEST_ALREADY_REVIEWED");
    }

    await assertStoreManagePermission(auth, request.requestedStore);

    const [user, employee, credential] = await Promise.all([
      User.findById(request.user).session(session),
      Employee.findById(request.employee).session(session),
      EmployeeCredential.findOne({ user: request.user }).session(session),
    ]);
    if (!user || !employee || !credential) {
      throw new HttpError(404, "Related signup entities not found", "REQUEST_ENTITY_MISSING");
    }

    user.isActive = false;
    await user.save({ session });
    employee.isActive = false;
    await employee.save({ session });

    credential.approvalStatus = "rejected";
    credential.status = "rejected";
    credential.rejectedReason = rejectionReason || "Rejected by reviewer";
    credential.approvedBy = null;
    credential.approvedAt = null;
    await credential.save({ session });

    request.requestStatus = "rejected";
    request.reviewedBy = auth.userId;
    request.reviewedAt = new Date();
    request.rejectionReason = rejectionReason || "Rejected by reviewer";
    await request.save({ session });

    await AuditLog.create([{
      user: auth.userId,
      action: "employee_access.signup.rejected",
      entityType: "signup_request",
      entityId: request._id.toString(),
      status: "success",
      notes: request.rejectionReason,
    }], { session });

    return mapSignupRequest(await request.populate("requestedStore", "name code"));
  });
}

export async function listCredentialAccounts(auth, input = {}) {
  const query = {};
  if (input.status) query.status = input.status;
  if (input.approvalStatus) query.approvalStatus = input.approvalStatus;

  const docs = await EmployeeCredential.find(query)
    .populate("employee", "fullName store")
    .sort({ createdAt: -1 });

  if (isAdmin(auth)) return docs.map(mapCredential);

  const managedStoreIds = await getManagedStoreIds(auth);
  const filtered = docs.filter((doc) => {
    const employeeStore = doc.employee?.store ? String(doc.employee.store) : "";
    return managedStoreIds.includes(employeeStore);
  });
  return filtered.map(mapCredential);
}

export async function updateCredentialStatus(auth, employeeId, nextStatus) {
  return withTransaction(async (session) => {
    const employee = await Employee.findById(employeeId).session(session);
    if (!employee) throw new HttpError(404, "Employee not found", "EMPLOYEE_NOT_FOUND");

    await assertStoreManagePermission(auth, employee.store);
    if (!isAdmin(auth) && nextStatus === "deactivated") {
      throw new HttpError(403, "Only admin can permanently deactivate accounts", "AUTH_FORBIDDEN");
    }

    const credential = await EmployeeCredential.findOne({ employee: employee._id }).session(session);
    if (!credential) throw new HttpError(404, "Employee credential not found", "CREDENTIAL_NOT_FOUND");

    credential.status = nextStatus;
    if (nextStatus === "approved") {
      credential.approvalStatus = "approved";
      credential.accountLocked = false;
      credential.loginAttempts = 0;
      credential.approvedBy = auth.userId;
      credential.approvedAt = new Date();
    }
    if (nextStatus === "locked") {
      credential.accountLocked = true;
    } else {
      credential.accountLocked = false;
    }
    await credential.save({ session });

    const user = await User.findById(employee.user).session(session);
    if (user) {
      user.isActive = !["deactivated", "suspended", "locked", "rejected", "pending"].includes(nextStatus);
      await user.save({ session });
    }
    employee.isActive = user ? user.isActive : employee.isActive;
    await employee.save({ session });

    await AuditLog.create([{
      user: auth.userId,
      action: "employee_access.credential.status.updated",
      entityType: "employee_credential",
      entityId: credential._id.toString(),
      status: "success",
      notes: `Status changed to ${nextStatus}`,
    }], { session });

    return mapCredential(await credential.populate("employee", "fullName store"));
  });
}

export async function resetCredentialPassword(auth, employeeId, passwordHash) {
  return withTransaction(async (session) => {
    if (!isAdmin(auth)) throw new HttpError(403, "Only admin can reset credentials", "AUTH_FORBIDDEN");
    const employee = await Employee.findById(employeeId).session(session);
    if (!employee) throw new HttpError(404, "Employee not found", "EMPLOYEE_NOT_FOUND");

    const credential = await EmployeeCredential.findOne({ employee: employee._id }).session(session);
    if (!credential) throw new HttpError(404, "Employee credential not found", "CREDENTIAL_NOT_FOUND");

    credential.passwordHash = passwordHash;
    credential.loginAttempts = 0;
    credential.accountLocked = false;
    if (credential.status === "locked") credential.status = "approved";
    await credential.save({ session });

    const user = await User.findById(employee.user).session(session);
    if (user) {
      user.passwordHash = passwordHash;
      await user.save({ session });
    }

    await AuditLog.create([{
      user: auth.userId,
      action: "employee_access.credential.password.reset",
      entityType: "employee_credential",
      entityId: credential._id.toString(),
      status: "success",
    }], { session });

    return { success: true };
  });
}

export async function listManagedStores(auth) {
  if (isAdmin(auth)) {
    const stores = await Store.find({ isActive: true }).sort({ name: 1 }).lean();
    return stores.map((s) => ({ id: s._id.toString(), name: s.name, code: s.code }));
  }
  const managedStoreIds = await getManagedStoreIds(auth);
  const stores = await Store.find({ _id: { $in: managedStoreIds }, isActive: true }).sort({ name: 1 }).lean();
  return stores.map((s) => ({ id: s._id.toString(), name: s.name, code: s.code }));
}
