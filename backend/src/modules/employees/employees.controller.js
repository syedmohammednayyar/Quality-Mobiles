import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import {
  createEmployee,
  deleteEmployee,
  listEmployees,
  updateEmployee,
} from "./employees.service.js";

const employeeRoleSchema = z.enum([
  "Manager",
  "Salesman",
  "Technician",
  "Staff",
]);
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

const createEmployeeSchema = z.object({
  name: z.string().min(1).max(150),
  role: employeeRoleSchema,
  store_ref: objectIdSchema,
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional(),
  username: z.string().max(100).optional(),
  password: z.string().min(6).max(120).optional(),
  join_date: z.string().optional().nullable(),
});

const updateEmployeeSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  role: employeeRoleSchema.optional(),
  store_ref: objectIdSchema.optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  username: z.string().min(1).max(100).optional(),
  password: z.string().min(6).max(120).optional(),
  join_date: z.string().optional().nullable(),
});

const employeeIdParamsSchema = z.object({
  employeeId: objectIdSchema,
});

export async function listEmployeesHandler(_req, res, next) {
  try {
    const rows = await listEmployees();
    res.status(200).json({ rows });
  } catch (error) {
    next(error);
  }
}

export async function createEmployeeHandler(req, res, next) {
  try {
    const payload = createEmployeeSchema.parse(req.body);
    const row = await createEmployee({
      name: payload.name,
      role: payload.role,
      storeRef: payload.store_ref,
      email: payload.email,
      phone: payload.phone,
      username: payload.username,
      password: payload.password,
      joinDate: payload.join_date,
    });
    res.status(201).json(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(
        new HttpError(
          400,
          error.issues[0]?.message || "Invalid request",
          "VALIDATION_ERROR",
        ),
      );
      return;
    }
    next(error);
  }
}

export async function updateEmployeeHandler(req, res, next) {
  try {
    const params = employeeIdParamsSchema.parse(req.params);
    const payload = updateEmployeeSchema.parse(req.body);

    const row = await updateEmployee(params.employeeId, {
      name: payload.name,
      role: payload.role,
      storeRef: payload.store_ref,
      email: payload.email,
      phone: payload.phone,
      username: payload.username,
      password: payload.password,
      joinDate: payload.join_date,
    });

    res.status(200).json(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(
        new HttpError(
          400,
          error.issues[0]?.message || "Invalid request",
          "VALIDATION_ERROR",
        ),
      );
      return;
    }
    next(error);
  }
}

export async function deleteEmployeeHandler(req, res, next) {
  try {
    const params = employeeIdParamsSchema.parse(req.params);
    await deleteEmployee(params.employeeId);
    res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(
        new HttpError(
          400,
          error.issues[0]?.message || "Invalid request",
          "VALIDATION_ERROR",
        ),
      );
      return;
    }
    next(error);
  }
}
