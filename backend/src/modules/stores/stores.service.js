import { Store } from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";

const FIXED_STORES = [
  { code: "STORE1", name: "Store 1" },
  { code: "STORE2", name: "Store 2" },
  { code: "STORE3", name: "Store 3" },
  { code: "STORE4", name: "Store 4" },
];

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
  const stores = await Store.find(query).sort({ code: 1, name: 1 });
  return stores.map(mapStore);
}

export async function createStore(input) {
  throw new HttpError(403, "Store creation is disabled. System supports only 4 fixed stores.", "STORE_FIXED_SET");
}

export async function updateStore(storeId, input) {
  return withTransaction(async (session) => {
    const store = await requireStore(storeId);
    if (!FIXED_STORES.some((s) => s.code === store.code)) {
      throw new HttpError(400, "Only fixed store set is supported", "STORE_INVALID_SET");
    }
    const isAdmin = Array.isArray(input.actorRoles) && input.actorRoles.includes("admin");

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
      if (!isAdmin) {
        throw new HttpError(403, "Managers can update store display settings only", "STORE_MANAGER_RESTRICTED");
      }
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
      if (!isAdmin) {
        throw new HttpError(403, "Managers can update store display settings only", "STORE_MANAGER_RESTRICTED");
      }
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
      if (!isAdmin) {
        throw new HttpError(403, "Managers can update store display settings only", "STORE_MANAGER_RESTRICTED");
      }
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
  throw new HttpError(403, "Store deletion/deactivation is disabled for fixed stores.", "STORE_FIXED_SET");
}

export async function ensureFixedStores() {
  await withTransaction(async (session) => {
    for (const item of FIXED_STORES) {
      await Store.updateOne(
        { code: item.code },
        {
          $set: { name: item.name, isActive: true, parentStore: null },
          $setOnInsert: { code: item.code },
        },
        { upsert: true, session },
      );
    }
    await Store.updateMany({ code: { $nin: FIXED_STORES.map((s) => s.code) } }, { $set: { isActive: false } }, { session });
  });
}
