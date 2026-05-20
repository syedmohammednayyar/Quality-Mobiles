import mongoose from "mongoose";
import {
  AuditLog,
  Employee,
  EmployeeCredential,
  EmployeeStoreAssignment,
  User,
} from "../../db/models.js";
import { HttpError } from "../../utils/httpError.js";
import { signAccessToken } from "../../utils/jwt.js";
import { verifyPassword } from "../../utils/password.js";

const MAX_LOGIN_ATTEMPTS = 5;

async function findAuthRecordByIdentifier(identifier) {
  const normalized = identifier.toLowerCase();
  const user = await User.findOne({
    $or: [{ username: normalized }, { email: normalized }],
  })
    .populate("roles")
    .exec();

  if (!user) return null;

  const employee = await Employee.findOne({ user: user._id, isActive: true }).exec();
  const credential = await EmployeeCredential.findOne({ user: user._id }).exec();
  const assignments = employee
    ? await EmployeeStoreAssignment.find({ employee: employee._id, status: "active" }).exec()
    : [];

  return { user, employee, credential, assignments };
}

function ensureApprovedCredential(credential, { allowWithoutCredential = false } = {}) {
  if (!credential) {
    if (allowWithoutCredential) return;
    throw new HttpError(403, "Credential is not provisioned", "AUTH_CREDENTIAL_NOT_FOUND");
  }
  if (credential.accountLocked || credential.status === "locked") {
    throw new HttpError(423, "Account is locked. Contact admin.", "AUTH_ACCOUNT_LOCKED");
  }
  if (credential.approvalStatus !== "approved" || credential.status !== "approved") {
    if (credential.approvalStatus === "rejected" || credential.status === "rejected") {
      throw new HttpError(403, credential.rejectedReason || "Signup request rejected", "AUTH_SIGNUP_REJECTED");
    }
    if (credential.status === "suspended") {
      throw new HttpError(403, "Account suspended by administrator", "AUTH_ACCOUNT_SUSPENDED");
    }
    if (credential.status === "deactivated") {
      throw new HttpError(403, "Account deactivated", "AUTH_ACCOUNT_DEACTIVATED");
    }
    throw new HttpError(403, "Account pending approval", "AUTH_PENDING_APPROVAL");
  }
}

async function registerFailedLogin(credential, userId) {
  if (!credential) return;
  credential.loginAttempts = Number(credential.loginAttempts || 0) + 1;
  if (credential.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
    credential.accountLocked = true;
    credential.status = "locked";
  }
  await credential.save();
  await AuditLog.create({
    user: userId || null,
    action: "auth.login.failed",
    entityType: "employee_credential",
    entityId: credential._id.toString(),
    status: "failure",
    notes: `Failed login attempt #${credential.loginAttempts}`,
  });
}

async function registerSuccessfulLogin(credential, userId) {
  if (!credential) return;
  credential.loginAttempts = 0;
  credential.lastLogin = new Date();
  credential.accountLocked = false;
  if (credential.status === "locked") credential.status = "approved";
  await credential.save();
  await AuditLog.create({
    user: userId || null,
    action: "auth.login.success",
    entityType: "employee_credential",
    entityId: credential._id.toString(),
    status: "success",
  });
}

function pickPrimaryStoreId(assignments, fallbackStoreId) {
  if (assignments && assignments.length > 0) return String(assignments[0].store);
  return fallbackStoreId ? String(fallbackStoreId) : null;
}

export async function login(input) {
  const record = await findAuthRecordByIdentifier(input.username);

  if (!record?.user || !record.user.isActive) {
    throw new HttpError(401, "Invalid username or password", "AUTH_INVALID_CREDENTIALS");
  }

  const credentialPasswordHash = record.credential?.passwordHash || record.user.passwordHash;
  const passwordOk = await verifyPassword(input.password, credentialPasswordHash);
  if (!passwordOk) {
    await registerFailedLogin(record.credential, record.user._id);
    throw new HttpError(401, "Invalid username or password", "AUTH_INVALID_CREDENTIALS");
  }

  const roles = (record.user.roles || []).map((r) => r.name);
  if (roles.length === 0) {
    throw new HttpError(403, "User has no roles assigned", "AUTH_ROLE_MISSING");
  }

  const isAdmin = roles.includes("admin");
  if (!record.credential && record.employee) {
    await EmployeeCredential.create({
      employee: record.employee._id,
      user: record.user._id,
      email: record.user.email,
      passwordHash: record.user.passwordHash,
      status: "approved",
      approvalStatus: "approved",
      approvedBy: record.user._id,
      approvedAt: new Date(),
      loginAttempts: 0,
      accountLocked: false,
    });
    record.credential = await EmployeeCredential.findOne({ user: record.user._id }).exec();
  }

  ensureApprovedCredential(record.credential, { allowWithoutCredential: isAdmin && !record.employee });

  const storeId = isAdmin
    ? null
    : pickPrimaryStoreId(record.assignments, record.employee?.store ? String(record.employee.store) : null);

  if (!isAdmin && !storeId) {
    throw new HttpError(403, "No active store assignment for this account", "AUTH_STORE_ASSIGNMENT_REQUIRED");
  }

  await registerSuccessfulLogin(record.credential, record.user._id);

  const authUser = {
    id: record.user._id.toString(),
    username: record.user.username || record.user.email,
    email: record.user.email,
    roles,
    store_id: storeId,
  };

  const accessToken = signAccessToken({
    id: authUser.id,
    userId: authUser.id,
    username: authUser.username,
    roles: authUser.roles,
    store_id: authUser.store_id,
  });

  return { accessToken, user: authUser };
}

export async function getCurrentUser(userId) {
  const user = await User.findById(userId).populate("roles").exec();
  if (!user || !user.isActive) {
    throw new HttpError(404, "User not found", "AUTH_USER_NOT_FOUND");
  }

  const employee = await mongoose.model("Employee").findOne({ user: user._id, isActive: true });
  const assignments = employee
    ? await EmployeeStoreAssignment.find({ employee: employee._id, status: "active" }).exec()
    : [];
  const store_id = pickPrimaryStoreId(assignments, employee?.store ? String(employee.store) : null);

  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    roles: user.roles.map((r) => r.name),
    store_id,
  };
}
