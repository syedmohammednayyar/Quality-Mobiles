import { Store } from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";

function mapStore(doc) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    code: doc.code,
    store_type: doc.parentStore ? "addon" : "main",
    parent: doc.parentStore ? doc.parentStore.toString() : null,
    is_active: doc.isActive !== false,
    created_at: doc.createdAt,
  };
}

async function requireStore(storeId) {
  const store = await Store.findById(storeId);
  if (!store) {
    throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
  }
  return store;
}

async function requireParentStore(parentId) {
  const exists = await Store.exists({ _id: parentId });
  if (!exists) {
    throw new HttpError(
      404,
      "Parent store not found",
      "STORE_PARENT_NOT_FOUND",
    );
  }
}

export async function listStores(filterStoreId) {
  const query = filterStoreId ? { _id: filterStoreId, isActive: { $ne: false } } : { isActive: { $ne: false } };
  const stores = await Store.find(query).sort({ createdAt: -1 });
  return stores.map(mapStore);
}

export async function createStore(input) {
  return withTransaction(async (session) => {
    const name = input.name.trim();
    const code = input.code.trim().toUpperCase();

    if (!name || !code) {
      throw new HttpError(
        400,
        "Store name and code are required",
        "STORE_REQUIRED_FIELDS",
      );
    }

    const parentId = input.storeType === "main" ? null : input.parent;
    if (parentId) {
      await requireParentStore(parentId);
    }

    try {
      const [store] = await Store.create([{
        name,
        code,
        parentStore: parentId,
        isActive: input.isActive ?? true,
      }], { session });

      return mapStore(store);
    } catch (error) {
      if (error.code === 11000) {
        throw new HttpError(
          409,
          "Store name or code already exists",
          "STORE_DUPLICATE",
        );
      }
      throw error;
    }
  });
}

export async function updateStore(storeId, input) {
  return withTransaction(async (session) => {
    const store = await requireStore(storeId);

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new HttpError(
          400,
          "Store name cannot be empty",
          "STORE_INVALID_NAME",
        );
      }
      store.name = name;
    }

    if (input.code !== undefined) {
      const code = input.code.trim().toUpperCase();
      if (!code) {
        throw new HttpError(
          400,
          "Store code cannot be empty",
          "STORE_INVALID_CODE",
        );
      }
      store.code = code;
    }

    if (input.storeType !== undefined || input.parent !== undefined) {
      let parentId = input.parent ?? null;
      if (input.storeType === "main") {
        parentId = null;
      }

      if (parentId && parentId.toString() === storeId.toString()) {
        throw new HttpError(
          400,
          "Store cannot be its own parent",
          "STORE_INVALID_PARENT",
        );
      }

      if (parentId) {
        await requireParentStore(parentId);
      }
      store.parentStore = parentId;
    }

    if (input.isActive !== undefined) {
      store.isActive = input.isActive;
    }

    try {
      await store.save({ session });
      return mapStore(store);
    } catch (error) {
      if (error.code === 11000) {
        throw new HttpError(
          409,
          "Store name or code already exists",
          "STORE_DUPLICATE",
        );
      }
      throw error;
    }
  });
}

export async function deactivateStore(storeId) {
  await withTransaction(async (session) => {
    const store = await requireStore(storeId);
    store.isActive = false;
    await store.save({ session });
  });
}
