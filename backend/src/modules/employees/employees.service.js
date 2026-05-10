import { randomBytes } from "crypto";
import { Employee, User, Role, Store, Sale } from "../../db/models.js";
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

async function requireStore(storeId) {
  const exists = await Store.exists({ _id: storeId, isActive: { $ne: false } });
  if (!exists) {
    throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
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

export async function listEmployees() {
  const employees = await Employee.find({ isActive: true })
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

export async function createEmployee(input) {
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

    const providedUsername = (input.username || "").trim();
    const username = providedUsername || buildGeneratedUsername(name);
    const password = (input.password || "").trim() || buildRandomPassword();

    if (providedUsername && !(input.password || "").trim()) {
      throw new HttpError(
        400,
        "Password is required when username is provided",
        "EMPLOYEE_PASSWORD_REQUIRED",
      );
    }

    const passwordHash = await hashPassword(password);
    const email = (input.email || "").trim() || `${username}@local.quality`;
    const phone = (input.phone || "").trim() || null;
    const hiredAt = input.joinDate ? new Date(input.joinDate) : null;

    try {
      const roleId = await getRoleId(mapEmployeeRoleToAuthRole(input.role));

      const [user] = await User.create([{
        username,
        email,
        passwordHash,
        isActive: Boolean(providedUsername),
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

export async function updateEmployee(employeeId, input) {
  return withTransaction(async (session) => {
    const employee = await Employee.findById(employeeId).populate('user');
    if (!employee || !employee.isActive) {
      throw new HttpError(404, "Employee not found", "EMPLOYEE_NOT_FOUND");
    }

    const user = employee.user;

    if (input.storeRef !== undefined) {
      if (!input.storeRef) {
        throw new HttpError(
          400,
          "Employee store is required",
          "EMPLOYEE_STORE_REQUIRED",
        );
      }
      await requireStore(input.storeRef);
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
      user.username = username;
      user.isActive = true;
    }

    if (input.email !== undefined) {
      const email = input.email.trim();
      if (!email) {
        throw new HttpError(
          400,
          "Email cannot be empty",
          "EMPLOYEE_INVALID_EMAIL",
        );
      }
      user.email = email;
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
      user.passwordHash = await hashPassword(password);
    }

    if (input.role !== undefined) {
      await replaceEmployeeRole(user, input.role);
    }

    try {
      await user.save({ session });
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
      employee.phone = input.phone.trim() || null;
    }

    if (input.storeRef !== undefined) {
      employee.store = input.storeRef || null;
    }

    if (input.joinDate !== undefined) {
      employee.hiredAt = input.joinDate ? new Date(input.joinDate) : null;
    }

    await employee.save({ session });

    return getEmployeeById(employeeId);
  });
}

export async function deleteEmployee(employeeId) {
  await withTransaction(async (session) => {
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
  });
}
