import {
  AuditLog,
  Employee,
  EmployeeCredential,
  EmployeeStoreAssignment,
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
  return Employee.findOne({ user: auth.userId });
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
