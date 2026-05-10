import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { assertStoreAccess, isAdmin } from "../../utils/storeAccess.js";
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  updateCustomer,
} from "./customers.service.js";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

const createCustomerSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional(),
  store_ref: objectIdSchema.nullable().optional(),
});

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional(),
  store_ref: objectIdSchema.nullable().optional(),
});

const customerIdParamsSchema = z.object({
  customerId: objectIdSchema,
});

export async function listCustomersHandler(req, res, next) {
  try {
    const storeId = isAdmin(req.auth) ? undefined : req.auth?.store_id;
    const rows = await listCustomers({ storeId });
    res.status(200).json({ rows });
  } catch (error) {
    next(error);
  }
}

export async function createCustomerHandler(req, res, next) {
  try {
    const payload = createCustomerSchema.parse(req.body);
    if (payload.store_ref) assertStoreAccess(req.auth, payload.store_ref);
    const row = await createCustomer({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      storeRef: payload.store_ref,
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

export async function updateCustomerHandler(req, res, next) {
  try {
    const params = customerIdParamsSchema.parse(req.params);
    const payload = updateCustomerSchema.parse(req.body);
    if (payload.store_ref) assertStoreAccess(req.auth, payload.store_ref);

    const row = await updateCustomer(params.customerId, {
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      storeRef: payload.store_ref,
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

export async function deleteCustomerHandler(req, res, next) {
  try {
    const params = customerIdParamsSchema.parse(req.params);
    await deleteCustomer(params.customerId);
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
