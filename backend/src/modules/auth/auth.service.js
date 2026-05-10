import mongoose from "mongoose";
import { Role, User } from "../../db/models.js";
import { HttpError } from "../../utils/httpError.js";
import { signAccessToken } from "../../utils/jwt.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";

async function getAuthUserByUsername(username) {
  const identifier = username.toLowerCase();
  const user = await User.findOne({
    $or: [{ username: identifier }, { email: identifier }],
  })
    .populate('roles')
    .exec();

  if (!user) return null;

  // Legacy/dirty data guard: treat missing password hash as non-authenticatable.
  if (!user.passwordHash) return null;

  // We also need the store_id from Employee record
  // In a real MongoDB app, we might embed store_id in User or use a separate lookup
  // For now, let's keep the logic similar but with Mongoose
  const employee = await mongoose.model('Employee').findOne({ user: user._id, isActive: true });

  return {
    id: user._id.toString(),
    username: user.username || user.email,
    email: user.email,
    password_hash: user.passwordHash,
    is_active: user.isActive !== false,
    roles: user.roles.map(r => r.name),
    store_id: employee ? employee.store.toString() : null
  };
}

function resolveRoleName(role) {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "manager") return "manager";
  if (normalized === "employee") return "cashier";
  return null;
}

export async function signup(input) {
  const email = input.email.trim().toLowerCase();
  const fullName = input.name.trim();
  const roleName = resolveRoleName(input.role);

  if (!roleName) {
    throw new HttpError(400, "Invalid role", "AUTH_INVALID_ROLE");
  }

  const existing = await User.findOne({
    $or: [{ username: email }, { email }],
  }).exec();

  if (existing) {
    throw new HttpError(409, "User already exists", "AUTH_USER_EXISTS");
  }

  let role = await Role.findOne({ name: roleName }).exec();
  if (!role) {
    role = await Role.create({ name: roleName, description: roleName });
  }

  const passwordHash = await hashPassword(input.password);
  const user = await User.create({
    username: email,
    email,
    fullName,
    passwordHash,
    isActive: true,
    roles: [role._id],
  });

  const authUser = {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    roles: [role.name],
    store_id: null,
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

export async function login(input) {
  try {
    const user = await getAuthUserByUsername(input.username);

    if (!user || !user.is_active) {
      throw new HttpError(
        401,
        "Invalid username or password",
        "AUTH_INVALID_CREDENTIALS",
      );
    }

    const passwordOk = await verifyPassword(input.password, user.password_hash);
    if (!passwordOk) {
      throw new HttpError(
        401,
        "Invalid username or password",
        "AUTH_INVALID_CREDENTIALS",
      );
    }

    if (user.roles.length === 0) {
      throw new HttpError(403, "User has no roles assigned", "AUTH_ROLE_MISSING");
    }

    const authUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles,
      store_id: user.store_id,
    };

    console.log('authUser:', authUser);
    console.log('authUser.id type:', typeof authUser.id, 'value:', authUser.id);
    console.log('authUser.store_id type:', typeof authUser.store_id, 'value:', authUser.store_id);

    const accessToken = signAccessToken({
      id: authUser.id,
      userId: authUser.id,
      username: authUser.username,
      roles: authUser.roles,
      store_id: authUser.store_id,
    });

    console.log('Token signed successfully');
    return { accessToken, user: authUser };
  } catch (error) {
    console.error('Error in login function:', error);
    throw error;
  }
}

export async function getCurrentUser(userId) {
  const user = await User.findById(userId).populate('roles').exec();

  if (!user || !user.isActive) {
    throw new HttpError(404, "User not found", "AUTH_USER_NOT_FOUND");
  }

  const employee = await mongoose.model('Employee').findOne({ user: user._id, isActive: true });

  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    roles: user.roles.map(r => r.name),
    store_id: employee ? employee.store.toString() : null,
  };
}
