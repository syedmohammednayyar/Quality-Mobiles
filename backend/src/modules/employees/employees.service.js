import { randomBytes } from "crypto";
import { AuditLog, Employee, EmployeeCredential, EmployeeStoreAssignment, User, Role, Store, Sale } from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { hashPassword } from "../../utils/password.js";
import { HttpError } from "../../utils/httpError.js";

function mapEmployee(doc, salesCount = 0) {
  let displayRole = "Staff";
  if (doc.user && doc.user.roles && doc.user.roles.length > 0) {
    const roles = doc.user.roles.map(r => r.name);
    if (roles.includes("manager")) displayRole = "Manager";
    else if (roles.includes("inventory_manager")) displayRole = "Technician";
    else if (roles.includes("cashier")) displayRole = "Salesman";
  }

  return {
    id: doc._id.toString(),
    name: doc.fullName,
    role: displayRole,
    store: doc.store ? doc.store.name : "",
    store_ref: doc.store ? doc.store._id.toString() : null,
    login_username: doc.user ? doc.user.username : "",
    email: doc.user ? (doc.user.email || "") : "",
    phone: doc.phone || "",
    sales_count: Number(salesCount),
    join_date: doc.hiredAt ? doc.hiredAt.toISOString() : null,
    created_at: doc.createdAt,
  };
}

function mapEmployeeRoleToAuthRole(role) {
  if (role === "Manager") return "manager";
  if (role === "Technician") return "inventory_manager";
  return "cashier";
}

function buildGeneratedUsername(baseName) {
  const slug =
    baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 10) || "emp";
  return `${slug}_${Date.now().toString().slice(-6)}${Math.floor(
    Math.random() * 1000,
  )
    .toString()
    .padStart(3, "0")}`;
}

function buildRandomPassword() {
  return randomBytes(9).toString("base64url");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").trim();
}

async function requireStore(storeId) {
  const exists = await Store.exists({ _id: storeId, isActive: { $ne: false } });
  if (!exists) {
    throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
  }
}

function isAdmin(auth) {
  return Boolean(auth?.roles?.includes("admin"));
}

function isManager(auth) {
  return Boolean(auth?.roles?.includes("manager"));
}

async function getManagedStoreIds(auth) {
  if (isAdmin(auth)) return null;
  if (!isManager(auth)) {
    throw new HttpError(403, "Forbidden", "AUTH_FORBIDDEN");
  }
  const actorEmployee = await Employee.findOne({ user: auth.userId, isActive: true });
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

async function assertStorePermission(auth, storeId) {
  if (isAdmin(auth)) return;
  const managed = await getManagedStoreIds(auth);
  if (!managed.includes(String(storeId))) {
    throw new HttpError(403, "Manager can only manage their assigned stores", "STORE_ACCESS_DENIED");
  }
}

async function getRoleId(roleName) {
  const role = await Role.findOne({ name: roleName });
  if (!role) {
    throw new HttpError(
      500,
      `Role ${roleName} is not configured`,
      "ROLE_NOT_CONFIGURED",
    );
  }
  return role._id;
}

async function getEmployeeById(employeeId) {
  const employee = await Employee.findById(employeeId)
    .populate({
      path: 'user',
      populate: { path: 'roles' }
    })
    .populate('store');

  if (!employee) {
    throw new HttpError(404, "Employee not found", "EMPLOYEE_NOT_FOUND");
  }

  const salesCount = await Sale.countDocuments({ employee: employeeId });
  return mapEmployee(employee, salesCount);
}

async function ensureUniqueIdentity({ userId = null, employeeId = null, email, username, phone }) {
  if (email) {
    const existingUser = await User.findOne({
      email,
      ...(userId ? { _id: { $ne: userId } } : {}),
    }).select("_id");
    if (existingUser) {
      throw new HttpError(409, "Email already exists", "EMPLOYEE_DUPLICATE_EMAIL");
    }
  }

  if (username) {
    const existingUser = await User.findOne({
      username,
      ...(userId ? { _id: { $ne: userId } } : {}),
    }).select("_id");
    if (existingUser) {
      throw new HttpError(409, "Username already exists", "EMPLOYEE_DUPLICATE_USERNAME");
    }
  }

  if (phone) {
    const existingEmployee = await Employee.findOne({
      phone,
      isActive: true,
      ...(employeeId ? { _id: { $ne: employeeId } } : {}),
    }).select("_id");
    if (existingEmployee) {
      throw new HttpError(409, "Phone already exists", "EMPLOYEE_DUPLICATE_PHONE");
    }
  }
}

async function replaceEmployeeRole(user, roleName) {
  const authRoleName = mapEmployeeRoleToAuthRole(roleName);
  const roleId = await getRoleId(authRoleName);

  // In Mongoose schema, roles is an array. We replace the primary employee role.
  // We'll filter out other standard employee roles first.
  const otherRoles = await Role.find({ 
    name: { $in: ['manager', 'cashier', 'inventory_manager'] } 
  });
  const otherRoleIds = otherRoles.map(r => r._id.toString());
  
  user.roles = user.roles.filter(r => !otherRoleIds.includes(r.toString()));
  user.roles.push(roleId);
}

export async function listEmployees(auth) {
  const query = { isActive: true };
  if (!isAdmin(auth)) {
    const managed = await getManagedStoreIds(auth);
    query.store = { $in: managed };
  }

  const employees = await Employee.find(query)
    .populate({
      path: 'user',
      populate: { path: 'roles' }
    })
    .populate('store')
    .sort({ createdAt: -1 });

  const results = [];
  for (const emp of employees) {
    const salesCount = await Sale.countDocuments({ employee: emp._id });
    results.push(mapEmployee(emp, salesCount));
  }
  return results;
}

export async function createEmployee(input, auth) {
  return withTransaction(async (session) => {
    const name = input.name.trim();
    if (!name) {
      throw new HttpError(
        400,
        "Employee name is required",
        "EMPLOYEE_REQUIRED_NAME",
      );
    }

    await requireStore(input.storeRef);
    await assertStorePermission(auth, input.storeRef);

    if (isManager(auth) && input.role === "Manager") {
      throw new HttpError(403, "Manager cannot create manager accounts", "MANAGER_ROLE_RESTRICTED");
    }

    const providedUsername = (input.username || "").trim();
    const username = (providedUsername || buildGeneratedUsername(name)).toLowerCase();
    const password = (input.password || "").trim() || buildRandomPassword();

    if (providedUsername && !(input.password || "").trim()) {
      throw new HttpError(
        400,
        "Password is required when username is provided",
        "EMPLOYEE_PASSWORD_REQUIRED",
      );
    }

    const passwordHash = await hashPassword(password);
    const email = normalizeEmail(input.email) || `${username}@local.quality`;
    const phone = normalizePhone(input.phone) || null;
    const hiredAt = input.joinDate ? new Date(input.joinDate) : null;

    try {
      const roleId = await getRoleId(mapEmployeeRoleToAuthRole(input.role));
      await ensureUniqueIdentity({ email, username, phone });

      const [user] = await User.create([{
        username,
        email,
        fullName: name,
        passwordHash,
        isActive: true,
        roles: [roleId]
      }], { session });

      const [employee] = await Employee.create([{
        user: user._id,
        store: input.storeRef,
        fullName: name,
        phone,
        hiredAt,
        isActive: true,
      }], { session });

      await EmployeeStoreAssignment.create([{
        employee: employee._id,
        store: input.storeRef,
        role: input.role === "Manager" ? "manager" : "staff",
        assignedBy: auth.userId,
        assignedAt: new Date(),
        status: "active",
      }], { session });

      await EmployeeCredential.create([{
        employee: employee._id,
        user: user._id,
        email,
        passwordHash,
        status: "approved",
        approvalStatus: "approved",
        approvedBy: auth.userId,
        approvedAt: new Date(),
        accountLocked: false,
        loginAttempts: 0,
      }], { session });

      await AuditLog.create([{
        user: auth.userId,
        action: "employee.created",
        entityType: "employee",
        entityId: employee._id.toString(),
        status: "success",
        notes: `Employee ${email} created for store ${input.storeRef}`,
      }], { session });

      return getEmployeeById(employee._id);
    } catch (error) {
      if (error.code === 11000) {
        throw new HttpError(
          409,
          "Username or email already exists",
          "EMPLOYEE_DUPLICATE_LOGIN",
        );
      }
      throw error;
    }
  });
}

export async function updateEmployee(employeeId, input, auth) {
  return withTransaction(async (session) => {
    const employee = await Employee.findById(employeeId).populate('user');
    if (!employee || !employee.isActive) {
      throw new HttpError(404, "Employee not found", "EMPLOYEE_NOT_FOUND");
    }

    const user = employee.user;
    const credential = await EmployeeCredential.findOne({ employee: employee._id }).session(session);
    await assertStorePermission(auth, employee.store);

    if (input.storeRef !== undefined) {
      if (!input.storeRef) {
        throw new HttpError(
          400,
          "Employee store is required",
          "EMPLOYEE_STORE_REQUIRED",
        );
      }
      await requireStore(input.storeRef);
      if (!isAdmin(auth) && String(input.storeRef) !== String(employee.store)) {
        throw new HttpError(403, "Manager cannot transfer employees between stores", "MANAGER_TRANSFER_FORBIDDEN");
      }
      await assertStorePermission(auth, input.storeRef);
    }

    if (input.username !== undefined) {
      const username = input.username.trim();
      if (!username) {
        throw new HttpError(
          400,
          "Username cannot be empty",
          "EMPLOYEE_INVALID_USERNAME",
        );
      }
      user.username = username.toLowerCase();
      user.isActive = true;
    }

    if (input.email !== undefined) {
      const email = normalizeEmail(input.email);
      if (!email) {
        throw new HttpError(
          400,
          "Email cannot be empty",
          "EMPLOYEE_INVALID_EMAIL",
        );
      }
      user.email = email;
      if (credential) credential.email = email;
    }

    if (input.password !== undefined) {
      const password = input.password.trim();
      if (!password) {
        throw new HttpError(
          400,
          "Password cannot be empty",
          "EMPLOYEE_INVALID_PASSWORD",
        );
      }
      const passwordHash = await hashPassword(password);
      user.passwordHash = passwordHash;
      if (credential) {
        credential.passwordHash = passwordHash;
        credential.loginAttempts = 0;
        credential.accountLocked = false;
        if (credential.status === "locked") credential.status = "approved";
      }
    }

    if (input.role !== undefined) {
      if (isManager(auth) && input.role === "Manager") {
        throw new HttpError(403, "Manager cannot assign manager role", "MANAGER_ROLE_RESTRICTED");
      }
      await replaceEmployeeRole(user, input.role);
    }

    await ensureUniqueIdentity({
      userId: user._id,
      employeeId: employee._id,
      email: user.email,
      username: user.username,
      phone: input.phone !== undefined ? normalizePhone(input.phone) : normalizePhone(employee.phone),
    });

    try {
      await user.save({ session });
      if (credential) {
        await credential.save({ session });
      }
    } catch (error) {
      if (error.code === 11000) {
        throw new HttpError(
          409,
          "Username or email already exists",
          "EMPLOYEE_DUPLICATE_LOGIN",
        );
      }
      throw error;
    }

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new HttpError(
          400,
          "Employee name cannot be empty",
          "EMPLOYEE_INVALID_NAME",
        );
      }
      employee.fullName = name;
    }

    if (input.phone !== undefined) {
      employee.phone = normalizePhone(input.phone) || null;
    }

    const originalStoreId = String(employee.store);
    if (input.storeRef !== undefined) {
      employee.store = input.storeRef || null;
    }

    if (input.joinDate !== undefined) {
      employee.hiredAt = input.joinDate ? new Date(input.joinDate) : null;
    }

    await employee.save({ session });

    const targetStore = input.storeRef || employee.store;
    if (input.storeRef && String(input.storeRef) !== originalStoreId) {
      await EmployeeStoreAssignment.updateMany(
        { employee: employee._id, status: "active" },
        { $set: { status: "inactive" } },
        { session },
      );
    }
    await EmployeeStoreAssignment.updateOne(
      { employee: employee._id, store: targetStore },
      {
        $set: {
          role: (input.role || "").toLowerCase() === "manager" ? "manager" : "staff",
          status: "active",
          assignedBy: auth.userId,
          assignedAt: new Date(),
        },
      },
      { upsert: true, session },
    );

    await AuditLog.create([{
      user: auth.userId,
      action: "employee.updated",
      entityType: "employee",
      entityId: employee._id.toString(),
      status: "success",
    }], { session });

    return getEmployeeById(employeeId);
  });
}

export async function deleteEmployee(employeeId, auth) {
  await withTransaction(async (session) => {
    if (!isAdmin(auth)) {
      throw new HttpError(403, "Only admin can remove employees", "AUTH_FORBIDDEN");
    }
    const employee = await Employee.findById(employeeId).populate('user');
    if (!employee) {
      throw new HttpError(404, "Employee not found", "EMPLOYEE_NOT_FOUND");
    }

    employee.isActive = false;
    await employee.save({ session });

    if (employee.user) {
      employee.user.isActive = false;
      await employee.user.save({ session });
    }

    await EmployeeCredential.updateOne(
      { employee: employee._id },
      {
        $set: {
          status: "deactivated",
          accountLocked: false,
        },
      },
      { session },
    );

    await EmployeeStoreAssignment.updateMany(
      { employee: employee._id },
      { $set: { status: "inactive" } },
      { session },
    );

    await AuditLog.create([{
      user: auth.userId,
      action: "employee.deleted",
      entityType: "employee",
      entityId: employee._id.toString(),
      status: "success",
    }], { session });
  });
}
