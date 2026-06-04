import mongoose from "mongoose";
import crypto from "node:crypto";
import {
  AuditLog,
  AuthSession,
  Employee,
  EmployeeCredential,
  EmployeeStoreAssignment,
  User,
} from "../../db/models.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/httpError.js";
import { signAccessToken } from "../../utils/jwt.js";
import { verifyPassword } from "../../utils/password.js";

async function findAuthRecordByIdentifier(identifier) {
  const normalized = identifier.toLowerCase();
  const user = await User.findOne({
    $or: [{ username: normalized }, { email: normalized }],
  })
    .populate("roles")
    .exec();

  if (!user) return null;

  const employee = await Employee.findOne({ user: user._id }).exec();
  const credential = await EmployeeCredential.findOne({ user: user._id }).exec();
  const assignments = employee
    ? await EmployeeStoreAssignment.find({ employee: employee._id, status: "active" }).exec()
    : [];

  return { user, employee, credential, assignments };
}

function ensureProvisionedCredential(credential, { allowWithoutCredential = false } = {}) {
  if (!credential) {
    if (allowWithoutCredential) return;
    throw new HttpError(403, "Credential is not provisioned", "AUTH_CREDENTIAL_NOT_FOUND");
  }
}

async function registerFailedLogin(credential, userId) {
  if (!credential) return;
  credential.loginAttempts = Number(credential.loginAttempts || 0) + 1;
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
  credential.status = "approved";
  credential.approvalStatus = "approved";
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

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function refreshExpiry() {
  return new Date(Date.now() + env.refreshTokenDays * 24 * 60 * 60 * 1000);
}

function createAccessToken(authUser, sessionId) {
  return signAccessToken({
    id: authUser.id,
    userId: authUser.id,
    username: authUser.username,
    roles: authUser.roles,
    store_id: authUser.store_id,
    sessionId,
  });
}

async function createRefreshSession(userId, metadata = {}, familyId = crypto.randomUUID()) {
  const refreshToken = newRefreshToken();
  const session = await AuthSession.create({
    user: userId,
    tokenHash: hashRefreshToken(refreshToken),
    familyId,
    deviceId: metadata.deviceId || crypto.randomUUID(),
    userAgent: metadata.userAgent || "",
    ipAddress: metadata.ipAddress || "",
    expiresAt: refreshExpiry(),
  });
  return { refreshToken, session };
}

export async function login(input, metadata = {}) {
  const record = await findAuthRecordByIdentifier(input.username);

  if (!record?.user) {
    throw new HttpError(401, "Invalid username or password", "AUTH_INVALID_CREDENTIALS");
  }
  if (record.user.isActive === false || record.employee?.isActive === false) {
    throw new HttpError(403, "Account is inactive", "AUTH_ACCOUNT_INACTIVE");
  }

  const credentialPasswordHash = record.credential?.passwordHash || record.user.passwordHash;
  const passwordOk = await verifyPassword(input.password, credentialPasswordHash);
  if (!passwordOk) {
    await registerFailedLogin(record.credential, record.user._id);
    throw new HttpError(401, "Invalid username or password", "AUTH_INVALID_CREDENTIALS");
  }

  const roles = [...new Set((record.user.roles || []).map((r) =>
    r.name === "cashier" || r.name === "inventory_manager" ? "employee" : r.name
  ))];
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

  ensureProvisionedCredential(record.credential, { allowWithoutCredential: isAdmin && !record.employee });

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

  const { refreshToken, session } = await createRefreshSession(record.user._id, metadata);
  const accessToken = createAccessToken(authUser, session._id.toString());

  return { accessToken, refreshToken, refreshExpiresAt: session.expiresAt, user: authUser };
}

export async function getCurrentUser(userId) {
  const user = await User.findById(userId).populate("roles").exec();
  if (!user) {
    throw new HttpError(404, "User not found", "AUTH_USER_NOT_FOUND");
  }
  if (user.isActive === false) {
    throw new HttpError(403, "Account is inactive", "AUTH_ACCOUNT_INACTIVE");
  }

  const employee = await mongoose.model("Employee").findOne({ user: user._id });
  if (employee?.isActive === false) {
    throw new HttpError(403, "Account is inactive", "AUTH_ACCOUNT_INACTIVE");
  }
  const assignments = employee
    ? await EmployeeStoreAssignment.find({ employee: employee._id, status: "active" }).exec()
    : [];
  const store_id = pickPrimaryStoreId(assignments, employee?.store ? String(employee.store) : null);

  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    roles: [...new Set(user.roles.map((r) =>
      r.name === "cashier" || r.name === "inventory_manager" ? "employee" : r.name
    ))],
    store_id,
  };
}

export async function refreshLogin(refreshToken, metadata = {}) {
  if (!refreshToken) {
    throw new HttpError(401, "Refresh session required", "AUTH_REFRESH_REQUIRED");
  }

  const tokenHash = hashRefreshToken(refreshToken);
  let session = await AuthSession.findOne({ tokenHash }).exec();
  if (session?.revokedAt && Date.now() - session.revokedAt.getTime() < 30_000) {
    session = await AuthSession.findOne({
      familyId: session.familyId,
      deviceId: session.deviceId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 }).exec();
  }
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    throw new HttpError(401, "Refresh session expired or revoked", "AUTH_REFRESH_INVALID");
  }

  const authUser = await getCurrentUser(session.user);
  const replacement = await createRefreshSession(session.user, {
    ...metadata,
    deviceId: session.deviceId,
  }, session.familyId);
  session.revokedAt = new Date();
  session.lastUsedAt = new Date();
  session.replacedByTokenHash = replacement.session.tokenHash;
  await session.save();

  return {
    accessToken: createAccessToken(authUser, replacement.session._id.toString()),
    refreshToken: replacement.refreshToken,
    refreshExpiresAt: replacement.session.expiresAt,
    user: authUser,
  };
}

export async function revokeRefreshSession(refreshToken) {
  if (!refreshToken) return;
  await AuthSession.updateOne(
    { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeAllUserSessions(userId) {
  await AuthSession.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}
