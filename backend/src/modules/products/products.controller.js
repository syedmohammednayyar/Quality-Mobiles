import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { assertStoreAccess } from "../../utils/storeAccess.js";
import {
  createProduct,
  deleteProduct,
  listProducts,
  updateProduct,
} from "./products.service.js";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");

const productCategorySchema = z.enum(["new_phone", "used_phone", "accessories", "services"]);
const conditionSchema = z.enum(["new", "used", "refurbished", "open_box", "damaged"]);

const productPayloadSchema = z.object({
  job_id: z.string().max(80).optional(),
  product_code: z.string().max(80).optional(),
  sku: z.string().min(1).max(80),
  barcode: z.string().max(120).optional(),
  imei: z.string().max(40).optional(),
  serial_number: z.string().max(80).optional(),
  name: z.string().min(1).max(200),
  brand: z.string().max(100).optional(),
  model: z.string().max(120).optional(),
  category: productCategorySchema,
  variant: z.string().max(120).optional(),
  ram: z.string().max(40).optional(),
  storage: z.string().max(40).optional(),
  color: z.string().max(60).optional(),
  condition: conditionSchema.optional(),
  description: z.string().max(1000).optional(),
  purchase_price: z.coerce.number().min(0).optional(),
  price: z.coerce.number().min(0),
  selling_price: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).optional(),
  tax: z.coerce.number().min(0).max(100).optional(),
  stock_quantity: z.coerce.number().int().min(0).default(0),
  min_stock_level: z.coerce.number().int().min(0).default(0),
  primary_store_ref: objectIdSchema.nullable().optional(),
  supplier_name: z.string().max(150).optional(),
  supplier_contact: z.string().max(150).optional(),
  purchase_date: z.string().optional().nullable(),
  images: z.array(z.string().max(1000)).optional(),
  remarks: z.string().max(1000).optional(),
  device_notes: z.string().max(1000).optional(),
  active: z.boolean().optional(),
});

const createProductSchema = productPayloadSchema;
const updateProductSchema = productPayloadSchema.partial();

const productIdParamsSchema = z.object({
  productId: objectIdSchema,
});

const listProductsQuerySchema = z.object({
  store_id: objectIdSchema.optional(),
});

function handleZod(error, next) {
  if (error instanceof z.ZodError) {
    next(new HttpError(400, error.issues[0]?.message || "Invalid request", "VALIDATION_ERROR"));
    return true;
  }
  return false;
}

function toServicePayload(payload, userId) {
  return {
    userId,
    jobId: payload.job_id,
    productCode: payload.product_code,
    sku: payload.sku,
    barcode: payload.barcode,
    imei: payload.imei,
    serialNumber: payload.serial_number,
    name: payload.name,
    brand: payload.brand,
    model: payload.model,
    category: payload.category,
    variant: payload.variant,
    ram: payload.ram,
    storage: payload.storage,
    color: payload.color,
    condition: payload.condition,
    description: payload.description,
    purchasePrice: payload.purchase_price,
    price: payload.selling_price ?? payload.price,
    discount: payload.discount,
    tax: payload.tax,
    stockQuantity: payload.stock_quantity,
    minStockLevel: payload.min_stock_level,
    primaryStoreRef: payload.primary_store_ref,
    supplierName: payload.supplier_name,
    supplierContact: payload.supplier_contact,
    purchaseDate: payload.purchase_date,
    images: payload.images,
    remarks: payload.remarks,
    deviceNotes: payload.device_notes,
    active: payload.active,
  };
}

export async function listProductsHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const query = listProductsQuerySchema.parse(req.query);
    if (query.store_id) assertStoreAccess(req.auth, query.store_id);
    const rows = await listProducts({ storeId: query.store_id });
    res.status(200).json({ rows });
  } catch (error) {
    if (handleZod(error, next)) return;
    next(error);
  }
}

export async function createProductHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const payload = createProductSchema.parse(req.body);
    if (payload.primary_store_ref) assertStoreAccess(req.auth, payload.primary_store_ref);

    const row = await createProduct(toServicePayload(payload, req.auth.userId));
    res.status(201).json(row);
  } catch (error) {
    if (handleZod(error, next)) return;
    next(error);
  }
}

export async function updateProductHandler(req, res, next) {
  try {
    if (!req.auth) throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    const params = productIdParamsSchema.parse(req.params);
    const payload = updateProductSchema.parse(req.body);
    if (payload.primary_store_ref) assertStoreAccess(req.auth, payload.primary_store_ref);

    const row = await updateProduct(params.productId, toServicePayload(payload, req.auth.userId));
    res.status(200).json(row);
  } catch (error) {
    if (handleZod(error, next)) return;
    next(error);
  }
}

export async function deleteProductHandler(req, res, next) {
  try {
    const params = productIdParamsSchema.parse(req.params);
    await deleteProduct(params.productId);
    res.status(204).send();
  } catch (error) {
    if (handleZod(error, next)) return;
    next(error);
  }
}
