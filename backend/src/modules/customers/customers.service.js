import { Customer, Store } from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";

function mapCustomer(doc) {
  return {
    id: doc._id.toString(),
    name: doc.fullName,
    email: doc.email || "",
    phone: doc.phone || "",
    store_ref: doc.store ? doc.store.toString() : null,
    created_at: doc.createdAt,
  };
}

async function requireCustomer(customerId) {
  const exists = await Customer.exists({ _id: customerId });
  if (!exists) {
    throw new HttpError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  }
}

async function requireStore(storeId) {
  const exists = await Store.exists({ _id: storeId, isActive: { $ne: false } });
  if (!exists) {
    throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
  }
}

export async function listCustomers(input = {}) {
  const query = input.storeId ? { store: input.storeId } : {};
  const customers = await Customer.find(query).sort({ createdAt: -1 });
  return customers.map(mapCustomer);
}

export async function createCustomer(input) {
  return withTransaction(async (session) => {
    const name = input.name.trim();
    if (!name) {
      throw new HttpError(
        400,
        "Customer name is required",
        "CUSTOMER_REQUIRED_NAME",
      );
    }

    const email = (input.email || "").trim() || null;
    const phone = (input.phone || "").trim() || null;

    if (input.storeRef) {
      await requireStore(input.storeRef);
    }

    try {
      const [customer] = await Customer.create([{
        fullName: name,
        email,
        phone,
        store: input.storeRef || null,
      }], { session });

      return mapCustomer(customer);
    } catch (error) {
      if (error.code === 11000) {
        throw new HttpError(
          409,
          "Customer phone or email already exists",
          "CUSTOMER_DUPLICATE",
        );
      }
      throw error;
    }
  });
}

export async function updateCustomer(customerId, input) {
  return withTransaction(async (session) => {
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new HttpError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
    }

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new HttpError(
          400,
          "Customer name cannot be empty",
          "CUSTOMER_INVALID_NAME",
        );
      }
      customer.fullName = name;
    }

    if (input.email !== undefined) {
      customer.email = input.email.trim() || null;
    }

    if (input.phone !== undefined) {
      customer.phone = input.phone.trim() || null;
    }

    if (input.storeRef !== undefined) {
      if (input.storeRef) {
        await requireStore(input.storeRef);
      }
      customer.store = input.storeRef || null;
    }

    try {
      await customer.save({ session });
      return mapCustomer(customer);
    } catch (error) {
      if (error.code === 11000) {
        throw new HttpError(
          409,
          "Customer phone or email already exists",
          "CUSTOMER_DUPLICATE",
        );
      }
      throw error;
    }
  });
}

export async function deleteCustomer(customerId) {
  await withTransaction(async (session) => {
    await requireCustomer(customerId);
    await Customer.deleteOne({ _id: customerId }, { session });
  });
}
