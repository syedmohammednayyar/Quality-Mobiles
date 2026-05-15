export interface ApiCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  store_ref?: string | null;
  created_at: string;
}

export interface ApiStore {
  id: string;
  name: string;
  code: string;
  store_type: "main" | "addon";
  parent: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ApiEmployee {
  id: string;
  name: string;
  role: "Manager" | "Salesman" | "Technician" | "Staff";
  store: string;
  store_ref?: string | null;
  login_username?: string;
  email: string;
  phone: string;
  sales_count: number;
  join_date: string | null;
  created_at: string;
}

export interface ApiProduct {
  id: string;
  job_id?: string;
  product_code?: string;
  sku: string;
  barcode?: string;
  imei?: string;
  serial_number?: string;
  name: string;
  brand?: string;
  model?: string;
  category?: "new_phone" | "used_phone" | "accessories" | "services";
  description: string;
  variant?: string;
  ram?: string;
  storage?: string;
  color?: string;
  condition?: "new" | "used" | "refurbished" | "open_box" | "damaged";
  purchase_price?: string;
  price: string;
  selling_price?: string;
  discount?: string;
  tax?: string;
  final_price?: string;
  stock_quantity: number;
  min_stock_level?: number;
  primary_store_ref?: string | null;
  supplier_name?: string;
  supplier_contact?: string;
  purchase_date?: string;
  images?: string[];
  remarks?: string;
  device_notes?: string;
  inventory_mode?: "serialized" | "bulk";
  active: boolean;
}

export interface ApiStoreInventoryRow {
  store_id: string;
  store_name?: string;
  product_id: string;
  job_id?: string;
  product_code?: string;
  sku: string;
  barcode?: string;
  imei?: string;
  serial_number?: string;
  name: string;
  brand?: string;
  model?: string;
  category: string;
  variant?: string;
  ram?: string;
  storage?: string;
  color?: string;
  condition?: string;
  purchase_price?: string;
  selling_price?: string;
  discount?: string;
  tax?: string;
  final_price?: string;
  quantity: number;
  reserved_quantity: number;
  min_stock_level: number;
  stock_status?: "in_stock" | "low_stock" | "out_of_stock";
  unit_price: string;
  supplier_name?: string;
  supplier_contact?: string;
  purchase_date?: string;
  images?: string[];
  remarks?: string;
  device_notes?: string;
  updated_at: string;
}

export interface CreateProductPayload {
  job_id?: string;
  product_code?: string;
  sku: string;
  barcode?: string;
  imei?: string;
  serial_number?: string;
  name: string;
  brand?: string;
  model?: string;
  category: "new_phone" | "used_phone" | "accessories" | "services";
  description?: string;
  variant?: string;
  ram?: string;
  storage?: string;
  color?: string;
  condition?: "new" | "used" | "refurbished" | "open_box" | "damaged";
  purchase_price?: string;
  price: string;
  selling_price?: string;
  discount?: string;
  tax?: string;
  inventory_mode?: "serialized" | "bulk";
  stock_quantity: number;
  min_stock_level?: number;
  serialized_entries?: Array<{
    imei?: string;
    serial_number?: string;
    barcode?: string;
  }>;
  primary_store_ref?: string | null;
  supplier_name?: string;
  supplier_contact?: string;
  purchase_date?: string | null;
  remarks?: string;
  device_notes?: string;
  active?: boolean;
}

export interface ApiSaleItem {
  id?: string;
  product: string;
  quantity: number;
  unit_price: string;
  line_total?: string;
}

export interface ApiSale {
  id: string;
  customer: string | null;
  store_ref?: string | null;
  job_no?: string;
  ic_number?: string;
  cash_amount?: string;
  online_amount?: string;
  exchange_amount?: string;
  exchange_model?: string;
  got_amount?: string;
  gift?: string;
  salesperson_name?: string;
  attended_by_employee_id?: string | null;
  customer_source?: "walk_in" | "referred";
  referred_by_employee_id?: string | null;
  referral_notes?: string;
  sold_at: string;
  notes: string;
  items: ApiSaleItem[];
  total_amount: string;
  payment_status?: "pending" | "partial" | "paid";
}

export type BuybackWorkflowStatus =
  | "pending_inspection"
  | "inspection_completed"
  | "approved"
  | "rejected"
  | "repair_pending"
  | "repair_in_progress"
  | "repair_completed"
  | "ready_for_resale"
  | "reserved"
  | "sold";

export type BuybackCondition = "Excellent" | "Good" | "Fair" | "Poor";
export type BuybackPayoutMethod = "cash" | "bank_transfer" | "upi" | "partial";

export interface BuybackInspectionSection {
  screen_condition?: string;
  back_panel_condition?: string;
  frame_body_condition?: string;
  camera_condition?: string;
  buttons_condition?: string;
}

export interface BuybackFunctionalInspection {
  display_working?: boolean;
  touch_working?: boolean;
  face_id_fingerprint_working?: boolean;
  charging_port_working?: boolean;
  speaker_mic_working?: boolean;
  sim_detection_working?: boolean;
  wifi_bluetooth_working?: boolean;
  network_signal_working?: boolean;
}

export interface BuybackDamageDetection {
  water_damage?: boolean;
  cracks?: boolean;
  dead_pixels?: boolean;
  previously_repaired?: boolean;
  parts_replaced?: boolean;
}

export interface ApiBuyback {
  id: string;
  imei: string;
  serial_number?: string;
  brand: string;
  model: string;
  variant?: string;
  color: string;
  storage?: string;
  ram?: string;
  battery_health?: number;
  accessories_received?: string[];
  box_available?: boolean;
  charger_available?: boolean;
  physical_inspection?: BuybackInspectionSection;
  functional_inspection?: BuybackFunctionalInspection;
  damage_detection?: BuybackDamageDetection;
  customer?: string | null;
  customer_name?: string;
  customer_phone?: string;
  store_ref?: string | null;
  store_name?: string;
  assigned_store_ref?: string | null;
  assigned_store_name?: string;
  assigned_technician?: string | null;
  assigned_technician_name?: string;
  rack_location?: string;
  condition: BuybackCondition;
  condition_grade?: BuybackCondition;
  market_value: string;
  condition_deduction?: string;
  repair_deduction?: string;
  final_valuation?: string;
  negotiated_price: string;
  exchange_credit_amount?: string;
  cash_payout_amount?: string;
  suggested_resale_price?: string;
  expected_profit_margin?: number;
  exchange_credit_enabled?: boolean;
  payout_method?: BuybackPayoutMethod;
  linked_sale_id?: string | null;
  resale_customer?: string | null;
  resale_sale_id?: string | null;
  notes?: string;
  inspection_notes?: string;
  pricing_notes?: string;
  repair_notes?: string;
  resale_notes?: string;
  status: string;
  status_key: BuybackWorkflowStatus;
  inspection_completed_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  repair_started_at?: string | null;
  repair_completed_at?: string | null;
  reserved_at?: string | null;
  sold_at?: string | null;
  transfer_history?: Array<{ from_store?: string | null; to_store?: string | null; note?: string; transferred_by?: string | null; transferred_at?: string }>;
  inventory_product?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  approved_by?: string | null;
  rejected_by?: string | null;
  deleted_by?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at?: string;
  days_in_inventory?: number;
}

export interface BuybackListResponse {
  rows: ApiBuyback[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface BuybackListParams {
  search?: string;
  status?: BuybackWorkflowStatus;
  store_id?: string;
  assigned_technician_id?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  sort_by?: "imei" | "negotiated_price" | "market_value" | "final_valuation" | "status" | "updated_at" | "created_at";
  sort_dir?: "asc" | "desc";
}

export interface ApiRepairTicket {
  id: string;
  ticket_no: string;
  customer_name: string;
  customer?: string | null;
  store_ref?: string | null;
  device_model: string;
  problem?: string;
  technician_name: string;
  status: "Pending" | "In Progress" | "Completed" | "Delivered" | "Cancelled";
  parts: Array<{ name: string; qty: number; unitCost: number; status: "Pending" | "Purchased" }>;
  parts_charge?: string;
  labor_cost: string;
  got_amount?: string;
  in_cash?: string;
  in_online?: string;
  out_cash?: string;
  out_online?: string;
  warranty: "3 months" | "6 months" | "12 months";
  estimated_completion: string | null;
  notes: string;
  payment_status?: "pending" | "partial" | "paid";
  outstanding_amount?: string;
  created_at: string;
}

export interface ApiExpense {
  id: string;
  store_ref?: string | null;
  reason: string;
  out_cash: string;
  out_online: string;
  expense_date: string;
  notes: string;
  created_at: string;
}

export interface ApiPaymentEntry {
  id: string;
  store_ref?: string | null;
  entry_type: "in" | "out";
  dealer_name: string;
  cash_amount: string;
  online_amount: string;
  payment_status?: "pending" | "partial" | "paid";
  outstanding_amount?: string;
  entry_date: string;
  notes: string;
  source_type?: string | null;
  source_id?: string | null;
  created_at: string;
}

export interface ApiOutstandingBalance {
  source_type: "sale" | "repair";
  source_id: string;
  store_ref?: string | null;
  party_name: string;
  reference_no: string;
  total_amount: string;
  paid_amount: string;
  outstanding_amount: string;
  payment_status: "pending" | "partial" | "paid";
  created_at: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Manager" | "Sales" | "Staff" | "Salesman" | "Technician";
  assignedStoreId?: string;
  createdAt: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface CreateSalePayload {
  customer: string | null;
  store_ref?: string | null;
  job_no?: string;
  ic_number?: string;
  discount_amount?: string;
  cash_amount?: string;
  online_amount?: string;
  exchange_amount?: string;
  exchange_model?: string;
  got_amount?: string;
  gift?: string;
  salesperson_name?: string;
  attended_by_employee_id?: string | null;
  customer_source?: "walk_in" | "referred";
  referred_by_employee_id?: string | null;
  referral_notes?: string;
  notes: string;
  items: ApiSaleItem[];
}

export interface JobLookupResponse {
  sale: ApiSale | null;
  product: ApiProduct | null;
  customer: ApiCustomer | null;
  payments: Array<{ method: string; amount: string; status?: string; reference_no?: string | null }>;
  inventory: ApiStoreInventoryRow[];
  buyback: ApiBuyback | null;
  repair: ApiRepairTicket | null;
}

export interface CreateBuybackPayload {
  imei: string;
  serial_number?: string;
  customer: string;
  store_ref: string;
  assigned_store_ref?: string;
  assigned_technician?: string;
  brand: string;
  model: string;
  variant?: string;
  color?: string;
  storage?: string;
  ram?: string;
  battery_health?: number;
  accessories_received?: string[];
  box_available?: boolean;
  charger_available?: boolean;
  physical_inspection?: BuybackInspectionSection;
  functional_inspection?: BuybackFunctionalInspection;
  damage_detection?: BuybackDamageDetection;
  condition: BuybackCondition;
  market_value: string;
  condition_deduction?: string;
  repair_deduction?: string;
  final_valuation?: string;
  negotiated_price?: string;
  exchange_credit_amount?: string;
  cash_payout_amount?: string;
  suggested_resale_price?: string;
  expected_profit_margin?: string;
  exchange_credit_enabled?: boolean;
  payout_method?: BuybackPayoutMethod;
  linked_sale_id?: string;
  rack_location?: string;
  notes?: string;
  inspection_notes?: string;
  pricing_notes?: string;
  repair_notes?: string;
  resale_notes?: string;
}

export interface CreateRepairPayload {
  ticket_no: string;
  customer_name: string;
  customer?: string | null;
  store_ref?: string | null;
  device_model: string;
  problem?: string;
  technician_name: string;
  status?: "Pending" | "In Progress" | "Completed" | "Delivered" | "Cancelled";
  parts?: Array<{ name: string; qty: number; unitCost: number; status: "Pending" | "Purchased" }>;
  parts_charge?: string;
  labor_cost?: string;
  got_amount?: string;
  in_cash?: string;
  in_online?: string;
  out_cash?: string;
  out_online?: string;
  warranty?: "3 months" | "6 months" | "12 months";
  estimated_completion?: string | null;
  notes?: string;
}

export interface CreateExpensePayload {
  store_ref?: string | null;
  reason: string;
  out_cash: string;
  out_online: string;
  expense_date: string;
  notes?: string;
}

export interface CreatePaymentEntryPayload {
  store_ref?: string | null;
  entry_type: "in" | "out";
  dealer_name: string;
  cash_amount: string;
  online_amount: string;
  payment_status?: "pending" | "partial" | "paid";
  outstanding_amount?: string;
  entry_date: string;
  source_type?: string | null;
  source_id?: string | null;
  notes?: string;
}

export interface CreateEmployeePayload {
  name: string;
  role: "Manager" | "Salesman" | "Technician" | "Staff";
  store: string;
  store_ref?: string | null;
  email: string;
  phone: string;
  username?: string;
  password?: string;
  sales_count?: number;
  join_date?: string | null;
}

export interface CreateStorePayload {
  name: string;
  code: string;
  store_type: "main" | "addon";
  parent?: string | null;
  is_active?: boolean;
}

export interface BriefReportParams {
  from?: string;
  to?: string;
  month?: string;
  store?: string;
  section?: string;
}

export type ReportType = "sales" | "product" | "store";
export type ReportPeriod = "daily" | "weekly" | "monthly" | "custom";

export interface ReportFilters {
  type: ReportType;
  period: ReportPeriod;
  from?: string;
  to?: string;
  store?: string;
}

export interface SalesReportRow {
  date: string;
  transactions: number;
  unitsSold: number;
  revenue: number;
}

export interface ProductReportRow {
  productId: number;
  sku: string;
  productName: string;
  transactions: number;
  unitsSold: number;
  revenue: number;
}

export interface StoreReportRow {
  storeId: number | null;
  storeName: string;
  transactions: number;
  unitsSold: number;
  revenue: number;
}

export type ReportRow = SalesReportRow | ProductReportRow | StoreReportRow;

export interface ReportDataResponse {
  type: ReportType;
  period: ReportPeriod;
  from: string;
  to: string;
  store: number | null;
  rows: ReportRow[];
}

export interface ApiSignupRequest {
  id: string;
  employee_id: string | null;
  employee_name: string;
  email: string;
  phone: string;
  requested_role: string;
  requested_store_ref: string | null;
  requested_store_name: string;
  request_status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string;
  created_at: string;
}

export interface ApiCredentialAccount {
  id: string;
  employee_id: string | null;
  employee_name: string;
  email: string;
  status: "pending" | "approved" | "rejected" | "suspended" | "deactivated" | "locked";
  approval_status: "pending" | "approved" | "rejected";
  account_locked: boolean;
  login_attempts: number;
  last_login: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string;
  created_at: string;
  updated_at: string;
}

export interface AdminOverviewFilters {
  quickRange?: "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "custom";
  fromDate?: string;
  toDate?: string;
  storeIds?: string[];
}

export interface AdminOverviewResponse {
  filters: {
    quickRange: string;
    fromDate: string;
    toDate: string;
    storeIds: string[];
  };
  kpis: {
    totalSales: number;
    totalRepairs: number;
    totalExpenses: number;
    totalBuyback: number;
    inventoryValue: number;
    net: number;
  };
  counts: {
    sales: number;
    repairs: number;
    buybacks: number;
    expenses: number;
    payments: number;
    stores: number;
  };
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
const TOKEN_KEY = "quality-mobiles-token";
const USER_KEY = "quality-mobiles-user";

type BackendAuthUser = {
  id: string;
  username: string;
  email: string;
  roles: string[];
  store_id?: number | string | null;
};

type BackendStoreRow = {
  id: string | number;
  code: string;
  name: string;
  store_type?: "main" | "addon";
  parent?: string | null;
  parent_store_id?: string | null;
  is_active: boolean;
  created_at: string;
};

type BackendInventoryRow = {
  store_id: string;
  product_id: string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  reserved_quantity: number;
  min_stock_level: number;
  unit_price: string;
  inventory_mode?: "serialized" | "bulk";
  updated_at: string;
};

type BackendSale = {
  id: string;
  sale_no: string;
  store_id: string;
  customer_id: string | null;
  employee_id: string;
  subtotal: string;
  tax_total: string;
  discount_total: string;
  exchange_total: string;
  grand_total: string;
  amount_paid: string;
  payment_status: "pending" | "partial" | "paid";
  note?: string | null;
  jobNumber?: string | null;
  job_number?: string | null;
  icNumber?: string | null;
  ic_number?: string | null;
  cashAmount?: number;
  onlineAmount?: number;
  exchangeModel?: string | null;
  gotAmount?: number;
  gift?: string | null;
  salespersonName?: string | null;
  attendedBy?: string | null;
  customerSource?: "walk_in" | "referred";
  referredByEmployee?: string | null;
  referralNotes?: string | null;
  created_at: string;
  createdAt?: string;
};

type BackendSaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: string;
  line_total: string;
};

type BackendPayment = {
  id: string;
  sale_id: string;
  payment_method: string;
  status: string;
  amount: string;
  reference_no?: string | null;
  notes?: string | null;
  paid_at: string;
};

type BackendSaleDetailResponse = {
  sale: BackendSale;
  items: BackendSaleItem[];
  payments: BackendPayment[];
};

type BackendSaleListRow = {
  id: string;
};

type PaymentMethodForCreate = "cash" | "card" | "bank_transfer" | "upi" | "wallet" | "mixed";

export class ApiError extends Error {
  status: number;
  code?: string;
  payload?: unknown;

  constructor(status: number, message: string, code?: string, payload?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toMoney(value: number | string | undefined): string {
  return Number(value || 0).toFixed(2);
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures in restricted browser contexts.
  }
}

function sessionRemove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage removal failures in restricted browser contexts.
  }
}

function mapBackendRole(roles: string[]): AuthUser["role"] {
  const normalized = roles.map((role) => role.toLowerCase());
  if (normalized.includes("admin")) return "Admin";
  if (normalized.includes("manager") || normalized.includes("inventory_manager")) return "Manager";
  if (normalized.includes("cashier")) return "Sales";
  return "Staff";
}

function mapAuthUser(user: BackendAuthUser): AuthUser {
  return {
    id: String(user.id),
    name: user.username,
    email: user.email || "",
    role: mapBackendRole(user.roles || []),
    assignedStoreId: user.store_id ? String(user.store_id) : undefined,
    createdAt: nowIso(),
  };
}

function normalizeProductCategory(category: string): ApiProduct["category"] {
  if (category === "used_phone") return "used_phone";
  if (category === "repair_part") return "accessories";
  if (category === "accessory") return "accessories";
  if (category === "service") return "services";
  return "new_phone";
}

function apiCategoryToBackend(category: CreateProductPayload["category"]): string {
  if (category === "accessories") return "accessories";
  if (category === "services") return "services";
  return category;
}

function mapApiProduct(row: ApiProduct): ApiProduct {
  return {
    ...row,
    id: String(row.id),
    primary_store_ref: row.primary_store_ref === null || row.primary_store_ref === undefined ? null : String(row.primary_store_ref),
    price: toMoney(row.price),
    purchase_price: toMoney(row.purchase_price),
    selling_price: toMoney(row.selling_price || row.price),
    discount: toMoney(row.discount),
    tax: toMoney(row.tax),
    final_price: toMoney(row.final_price || row.price),
    stock_quantity: Number(row.stock_quantity || 0),
    min_stock_level: Number(row.min_stock_level || 0),
    inventory_mode: row.inventory_mode || "bulk",
    active: Boolean(row.active),
    category: row.category ? normalizeProductCategory(row.category) : undefined,
    description: row.description || "",
  };
}

function ensureAbsolutePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function mapStoreRow(row: BackendStoreRow): ApiStore {
  const parentFromLegacy = row.parent_store_id ? String(row.parent_store_id) : null;
  const normalizedParent = row.parent !== undefined && row.parent !== null ? String(row.parent) : parentFromLegacy;
  const storeType = row.store_type || (normalizedParent ? "addon" : "main");

  return {
    id: String(row.id),
    name: row.name,
    code: row.code,
    store_type: storeType,
    parent: normalizedParent,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

function resolveStoreFilter(store: string | undefined, stores: ApiStore[]): string | null {
  if (!store) return null;
  if (/^[a-f\d]{24}$/i.test(store)) {
    return store;
  }

  const match = stores.find((entry) => entry.name.toLowerCase() === store.toLowerCase());
  return match ? match.id : null;
}

async function apiRequest<T>(path: string, options: RequestInit = {}, requiresAuth = true): Promise<T> {
  const headers = new Headers(options.headers || {});
  const bodyIsFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (options.body && !headers.has("Content-Type") && !bodyIsFormData) {
    headers.set("Content-Type", "application/json");
  }

  if (requiresAuth) {
    const token = getAuthToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(`${API_BASE}${ensureAbsolutePath(path)}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  let payload: unknown = null;

  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => null);
  } else if (response.status !== 204) {
    payload = await response.text().catch(() => null);
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthToken();
      clearSessionUser();
    }

    const errorPayload = payload as { error?: { message?: string; code?: string }; message?: string; detail?: string } | null;
    const message = errorPayload?.error?.message || errorPayload?.message || errorPayload?.detail || `Request failed (${response.status})`;
    const code = errorPayload?.error?.code;
    throw new ApiError(response.status, message, code, payload);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return payload as T;
}

function inventoryRowToProduct(row: ApiStoreInventoryRow): ApiProduct {
  return {
    id: row.product_id,
    job_id: row.job_id,
    product_code: row.product_code,
    sku: row.sku,
    barcode: row.barcode || row.sku,
    imei: row.imei,
    serial_number: row.serial_number,
    name: row.name,
    brand: row.brand,
    model: row.model,
    category: normalizeProductCategory(row.category),
    description: row.device_notes || "",
    variant: row.variant,
    ram: row.ram,
    storage: row.storage,
    color: row.color,
    condition: row.condition as ApiProduct["condition"],
    purchase_price: toMoney(row.purchase_price),
    price: toMoney(row.unit_price),
    selling_price: toMoney(row.selling_price || row.unit_price),
    discount: toMoney(row.discount),
    tax: toMoney(row.tax),
    final_price: toMoney(row.final_price || row.unit_price),
    stock_quantity: row.quantity,
    min_stock_level: row.min_stock_level,
    primary_store_ref: row.store_id,
    supplier_name: row.supplier_name,
    supplier_contact: row.supplier_contact,
    purchase_date: row.purchase_date,
    images: row.images,
    remarks: row.remarks,
    device_notes: row.device_notes,
    inventory_mode: (row as ApiStoreInventoryRow & { inventory_mode?: "serialized" | "bulk" }).inventory_mode || "bulk",
    active: true,
  };
}

function mapSaleDetailToApiSale(detail: BackendSaleDetailResponse): ApiSale {
  let cashAmount = 0;
  let onlineAmount = 0;

  detail.payments.forEach((payment) => {
    const value = toNumber(payment.amount);
    if (payment.payment_method === "cash") {
      cashAmount += value;
      return;
    }
    onlineAmount += value;
  });

  return {
    id: String(detail.sale.id),
    customer: detail.sale.customer_id ? String(detail.sale.customer_id) : null,
    store_ref: String(detail.sale.store_id),
    job_no: detail.sale.jobNumber || detail.sale.job_number || detail.sale.sale_no,
    ic_number: detail.sale.icNumber || detail.sale.ic_number || "",
    cash_amount: toMoney(cashAmount),
    online_amount: toMoney(onlineAmount),
    exchange_amount: toMoney(detail.sale.exchange_total),
    exchange_model: detail.sale.exchangeModel || "",
    got_amount: toMoney(detail.sale.gotAmount || detail.sale.amount_paid),
    gift: detail.sale.gift || "",
    salesperson_name: detail.sale.salespersonName || "",
    attended_by_employee_id: detail.sale.attendedBy ? String(detail.sale.attendedBy) : null,
    customer_source: detail.sale.customerSource || "walk_in",
    referred_by_employee_id: detail.sale.referredByEmployee ? String(detail.sale.referredByEmployee) : null,
    referral_notes: detail.sale.referralNotes || "",
    sold_at: detail.sale.created_at || detail.sale.createdAt || nowIso(),
    notes: detail.sale.note || "",
    items: detail.items.map((item) => ({
      id: String(item.id),
      product: String(item.product_id),
      quantity: item.quantity,
      unit_price: toMoney(item.unit_price),
      line_total: toMoney(item.line_total),
    })),
    total_amount: toMoney(detail.sale.grand_total),
    payment_status: detail.sale.payment_status,
  };
}

function buildPayments(payload: CreateSalePayload): Array<{ paymentMethod: PaymentMethodForCreate; amount: number; notes?: string }> {
  const cashAmount = toNumber(payload.cash_amount);
  const onlineAmount = toNumber(payload.online_amount);

  const payments: Array<{ paymentMethod: PaymentMethodForCreate; amount: number; notes?: string }> = [];

  if (cashAmount > 0) {
    payments.push({ paymentMethod: "cash", amount: cashAmount });
  }

  if (onlineAmount > 0) {
    payments.push({ paymentMethod: "bank_transfer", amount: onlineAmount });
  }

  return payments;
}

async function fetchSaleByIdRaw(saleId: string): Promise<BackendSaleDetailResponse> {
  return apiRequest<BackendSaleDetailResponse>(`/sales/${saleId}`);
}

export function getAuthToken(): string | null {
  return sessionGet(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  sessionSet(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  sessionRemove(TOKEN_KEY);
}

export function getSessionUser(): AuthUser | null {
  const raw = sessionGet(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSessionUser(user: AuthUser): void {
  sessionSet(USER_KEY, JSON.stringify(user));
}

export function clearSessionUser(): void {
  sessionRemove(USER_KEY);
}

export async function login(payload: { username: string; password: string }): Promise<LoginResponse> {
  const result = await apiRequest<{ accessToken: string; user: BackendAuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  }, false);

  return {
    token: result.accessToken,
    user: mapAuthUser(result.user),
  };
}

export async function getCurrentUser(): Promise<AuthUser> {
  const result = await apiRequest<{ user: BackendAuthUser }>("/auth/me");
  return mapAuthUser(result.user);
}

export async function logout(): Promise<{ detail: string }> {
  clearAuthToken();
  clearSessionUser();
  return { detail: "Logged out." };
}

export async function listStores(): Promise<ApiStore[]> {
  const result = await apiRequest<{ rows: BackendStoreRow[] }>("/stores");
  return result.rows.map(mapStoreRow);
}

export async function listStoreInventory(storeId: string, filters: { search?: string; category?: string; stockStatus?: string; limit?: number; offset?: number } = {}): Promise<ApiStoreInventoryRow[]> {
  const params = new URLSearchParams({ store_id: storeId });
  if (filters.search) params.set("search", filters.search);
  if (filters.category) params.set("category", filters.category);
  if (filters.stockStatus) params.set("stock_status", filters.stockStatus);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  const result = await apiRequest<{ rows: BackendInventoryRow[] }>(`/inventory?${params.toString()}`);
  return result.rows.map((row) => ({
    ...row,
    store_id: String(row.store_id),
    product_id: String(row.product_id),
    unit_price: toMoney(row.unit_price),
  }));
}

export async function createStore(payload: CreateStorePayload): Promise<ApiStore> {
  const row = await apiRequest<ApiStore>("/stores", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      code: payload.code,
      store_type: payload.store_type,
      parent: payload.parent ?? null,
      is_active: payload.is_active ?? true,
    }),
  });

  return {
    ...row,
    id: String(row.id),
    parent: row.parent === null || row.parent === undefined ? null : String(row.parent),
  };
}

export async function updateStore(id: string, payload: Partial<CreateStorePayload>): Promise<ApiStore> {
  const row = await apiRequest<ApiStore>(`/stores/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.code !== undefined ? { code: payload.code } : {}),
      ...(payload.store_type !== undefined ? { store_type: payload.store_type } : {}),
      ...(payload.parent !== undefined ? { parent: payload.parent } : {}),
      ...(payload.is_active !== undefined ? { is_active: payload.is_active } : {}),
    }),
  });

  return {
    ...row,
    id: String(row.id),
    parent: row.parent === null || row.parent === undefined ? null : String(row.parent),
  };
}

export async function deleteStore(id: string): Promise<void> {
  await apiRequest<void>(`/stores/${id}`, { method: "DELETE" });
}

export async function listCustomers(): Promise<ApiCustomer[]> {
  const result = await apiRequest<{ rows: ApiCustomer[] }>("/customers");
  return result.rows.map((entry) => ({
    ...entry,
    id: String(entry.id),
    store_ref: entry.store_ref === null || entry.store_ref === undefined ? null : String(entry.store_ref),
  }));
}

export async function createCustomer(payload: Pick<ApiCustomer, "name" | "email" | "phone" | "store_ref">): Promise<ApiCustomer> {
  const row = await apiRequest<ApiCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      store_ref: payload.store_ref ?? null,
    }),
  });

  return {
    ...row,
    id: String(row.id),
    store_ref: row.store_ref === null || row.store_ref === undefined ? null : String(row.store_ref),
  };
}

export async function updateCustomer(id: string, payload: Partial<Pick<ApiCustomer, "name" | "email" | "phone" | "store_ref">>): Promise<ApiCustomer> {
  const row = await apiRequest<ApiCustomer>(`/customers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return {
    ...row,
    id: String(row.id),
    store_ref: row.store_ref === null || row.store_ref === undefined ? null : String(row.store_ref),
  };
}

export async function deleteCustomer(id: string): Promise<void> {
  await apiRequest<void>(`/customers/${id}`, { method: "DELETE" });
}

export async function listEmployees(): Promise<ApiEmployee[]> {
  const result = await apiRequest<{ rows: ApiEmployee[] }>("/employees");
  return result.rows.map((entry) => ({
    ...entry,
    id: String(entry.id),
    store_ref: entry.store_ref === null || entry.store_ref === undefined ? null : String(entry.store_ref),
  }));
}

export async function createEmployee(payload: CreateEmployeePayload): Promise<ApiEmployee> {
  const row = await apiRequest<ApiEmployee>("/employees", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      role: payload.role,
      store_ref: payload.store_ref,
      email: payload.email,
      phone: payload.phone,
      username: payload.username,
      password: payload.password,
      join_date: payload.join_date,
    }),
  });

  return {
    ...row,
    id: String(row.id),
    store_ref: row.store_ref === null || row.store_ref === undefined ? null : String(row.store_ref),
  };
}

export async function updateEmployee(id: string, payload: Partial<CreateEmployeePayload>): Promise<ApiEmployee> {
  const row = await apiRequest<ApiEmployee>(`/employees/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.role !== undefined ? { role: payload.role } : {}),
      ...(payload.store_ref !== undefined ? { store_ref: payload.store_ref } : {}),
      ...(payload.email !== undefined ? { email: payload.email } : {}),
      ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
      ...(payload.username !== undefined ? { username: payload.username } : {}),
      ...(payload.password !== undefined ? { password: payload.password } : {}),
      ...(payload.join_date !== undefined ? { join_date: payload.join_date } : {}),
    }),
  });

  return {
    ...row,
    id: String(row.id),
    store_ref: row.store_ref === null || row.store_ref === undefined ? null : String(row.store_ref),
  };
}

export async function deleteEmployee(id: string): Promise<void> {
  await apiRequest<void>(`/employees/${id}`, { method: "DELETE" });
}

export async function listCredentialAccounts(params: { status?: string; approval_status?: string } = {}): Promise<ApiCredentialAccount[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.approval_status) query.set("approval_status", params.approval_status);
  const result = await apiRequest<{ rows: ApiCredentialAccount[] }>(`/employee-access/credentials${query.toString() ? `?${query.toString()}` : ""}`);
  return result.rows.map((row) => ({
    ...row,
    id: String(row.id),
    employee_id: row.employee_id ? String(row.employee_id) : null,
  }));
}

export async function updateCredentialStatus(employeeId: string, status: ApiCredentialAccount["status"]): Promise<ApiCredentialAccount> {
  const row = await apiRequest<ApiCredentialAccount>(`/employee-access/credentials/${employeeId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return {
    ...row,
    id: String(row.id),
    employee_id: row.employee_id ? String(row.employee_id) : null,
  };
}

export async function resetCredentialPassword(employeeId: string, password: string): Promise<void> {
  await apiRequest(`/employee-access/credentials/${employeeId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function listEmployeeAccessStores(): Promise<Array<{ id: string; name: string; code: string }>> {
  const result = await apiRequest<{ rows: Array<{ id: string; name: string; code: string }> }>("/employee-access/stores");
  return result.rows.map((s) => ({ ...s, id: String(s.id) }));
}

export async function listProducts(storeId?: string): Promise<ApiProduct[]> {
  if (storeId) {
    const rows = await listStoreInventory(storeId);
    return rows.map(inventoryRowToProduct);
  }

  const stores = (await listStores()).filter((store) => store.is_active);
  if (stores.length === 0) return [];

  const all = await Promise.all(
    stores.map(async (store) => {
      const rows = await listStoreInventory(store.id);
      return { storeId: store.id, rows };
    })
  );

  const merged = new Map<string, ApiProduct>();

  all.forEach(({ storeId: activeStoreId, rows }) => {
    rows.forEach((row) => {
      const existing = merged.get(row.product_id);
      if (!existing) {
        merged.set(row.product_id, {
          id: row.product_id,
          sku: row.sku,
          name: row.name,
          category: normalizeProductCategory(row.category),
          description: "",
          price: toMoney(row.unit_price),
          stock_quantity: row.quantity,
          primary_store_ref: activeStoreId,
          active: true,
        });
        return;
      }

      existing.stock_quantity += row.quantity;
    });
  });

  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createProduct(_payload: CreateProductPayload): Promise<ApiProduct> {
  const row = await apiRequest<ApiProduct>("/products", {
    method: "POST",
    body: JSON.stringify({
      sku: _payload.sku,
      job_id: _payload.job_id,
      product_code: _payload.product_code,
      barcode: _payload.barcode,
      imei: _payload.imei,
      serial_number: _payload.serial_number,
      name: _payload.name,
      brand: _payload.brand,
      model: _payload.model,
      category: apiCategoryToBackend(_payload.category),
      description: _payload.description || "",
      variant: _payload.variant,
      ram: _payload.ram,
      storage: _payload.storage,
      color: _payload.color,
      condition: _payload.condition,
      purchase_price: toNumber(_payload.purchase_price),
      price: toNumber(_payload.price),
      selling_price: _payload.selling_price !== undefined ? toNumber(_payload.selling_price) : undefined,
      discount: toNumber(_payload.discount),
      tax: toNumber(_payload.tax),
      inventory_mode: _payload.inventory_mode,
      stock_quantity: Number(_payload.stock_quantity || 0),
      min_stock_level: Number(_payload.min_stock_level || 0),
      serialized_entries: _payload.serialized_entries,
      primary_store_ref: _payload.primary_store_ref ?? null,
      supplier_name: _payload.supplier_name,
      supplier_contact: _payload.supplier_contact,
      purchase_date: _payload.purchase_date,
      remarks: _payload.remarks,
      device_notes: _payload.device_notes,
      active: _payload.active ?? true,
    }),
  });

  return mapApiProduct(row);
}

export async function updateProduct(_id: string, _payload: Partial<CreateProductPayload>): Promise<ApiProduct> {
  const body: Record<string, unknown> = {
    ...(_payload.job_id !== undefined ? { job_id: _payload.job_id } : {}),
    ...(_payload.product_code !== undefined ? { product_code: _payload.product_code } : {}),
    ...(_payload.sku !== undefined ? { sku: _payload.sku } : {}),
    ...(_payload.barcode !== undefined ? { barcode: _payload.barcode } : {}),
    ...(_payload.imei !== undefined ? { imei: _payload.imei } : {}),
    ...(_payload.serial_number !== undefined ? { serial_number: _payload.serial_number } : {}),
    ...(_payload.name !== undefined ? { name: _payload.name } : {}),
    ...(_payload.brand !== undefined ? { brand: _payload.brand } : {}),
    ...(_payload.model !== undefined ? { model: _payload.model } : {}),
    ...(_payload.category !== undefined ? { category: apiCategoryToBackend(_payload.category) } : {}),
    ...(_payload.description !== undefined ? { description: _payload.description } : {}),
    ...(_payload.variant !== undefined ? { variant: _payload.variant } : {}),
    ...(_payload.ram !== undefined ? { ram: _payload.ram } : {}),
    ...(_payload.storage !== undefined ? { storage: _payload.storage } : {}),
    ...(_payload.color !== undefined ? { color: _payload.color } : {}),
    ...(_payload.condition !== undefined ? { condition: _payload.condition } : {}),
    ...(_payload.purchase_price !== undefined ? { purchase_price: toNumber(_payload.purchase_price) } : {}),
    ...(_payload.price !== undefined ? { price: toNumber(_payload.price) } : {}),
    ...(_payload.selling_price !== undefined ? { selling_price: toNumber(_payload.selling_price) } : {}),
    ...(_payload.discount !== undefined ? { discount: toNumber(_payload.discount) } : {}),
    ...(_payload.tax !== undefined ? { tax: toNumber(_payload.tax) } : {}),
    ...(_payload.inventory_mode !== undefined ? { inventory_mode: _payload.inventory_mode } : {}),
    ...(_payload.stock_quantity !== undefined ? { stock_quantity: Number(_payload.stock_quantity) } : {}),
    ...(_payload.min_stock_level !== undefined ? { min_stock_level: Number(_payload.min_stock_level) } : {}),
    ...(_payload.serialized_entries !== undefined ? { serialized_entries: _payload.serialized_entries } : {}),
    ...(_payload.primary_store_ref !== undefined ? { primary_store_ref: _payload.primary_store_ref } : {}),
    ...(_payload.supplier_name !== undefined ? { supplier_name: _payload.supplier_name } : {}),
    ...(_payload.supplier_contact !== undefined ? { supplier_contact: _payload.supplier_contact } : {}),
    ...(_payload.purchase_date !== undefined ? { purchase_date: _payload.purchase_date } : {}),
    ...(_payload.remarks !== undefined ? { remarks: _payload.remarks } : {}),
    ...(_payload.device_notes !== undefined ? { device_notes: _payload.device_notes } : {}),
    ...(_payload.active !== undefined ? { active: _payload.active } : {}),
  };

  const row = await apiRequest<ApiProduct>(`/products/${_id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  return mapApiProduct(row);
}

export async function deleteProduct(_id: string): Promise<void> {
  await apiRequest<void>(`/products/${_id}`, { method: "DELETE" });
}

export async function createInventoryChangeRequest(storeId: string, productId: string, oldValue: number, newValue: number, reason?: string) {
  return apiRequest<{ id: string }>(`/change-requests`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "inventory",
      entityId: `${storeId}:${productId}`,
      fieldName: "quantity",
      oldValue: String(oldValue),
      newValue: String(newValue),
      reason: reason || null,
    }),
  });
}

export async function transferInventoryStock(payload: {
  from_store_id: string;
  to_store_id: string;
  product_id: string;
  quantity: number;
  reason: string;
}): Promise<{ id: string }> {
  return apiRequest<{ id: string }>("/inventory/transfers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function exportInventoryPdf(storeId?: string): Promise<Blob> {
  const token = getAuthToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const url = `${API_BASE}/workflows/exports/inventory/pdf${storeId ? `?storeId=${storeId}` : ""}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new ApiError(resp.status, text || `Export failed (${resp.status})`);
  }

  return resp.blob();
}

export async function listSales(): Promise<ApiSale[]> {
  const response = await apiRequest<{ rows: BackendSaleListRow[] }>("/sales");
  const details = await Promise.all(
    response.rows.map(async (row) => {
      try {
        return await fetchSaleByIdRaw(String(row.id));
      } catch {
        return null;
      }
    })
  );

  return details.filter((entry): entry is BackendSaleDetailResponse => entry !== null).map(mapSaleDetailToApiSale);
}

export async function createSale(payload: CreateSalePayload): Promise<ApiSale> {
  if (!payload.store_ref) {
    throw new ApiError(400, "Store is required.", "VALIDATION_ERROR");
  }

  if (!payload.items.length) {
    throw new ApiError(400, "At least one sale item is required.", "VALIDATION_ERROR");
  }

  const exchangeTotal = toNumber(payload.exchange_amount);
  const discountTotal = toNumber(payload.discount_amount);

  const result = await apiRequest<BackendSaleDetailResponse>("/sales", {
    method: "POST",
    body: JSON.stringify({
      storeId: payload.store_ref,
      customerId: payload.customer || undefined,
      discountTotal,
      exchangeTotal,
      jobNumber: payload.job_no,
      icNumber: payload.ic_number,
      cashAmount: toNumber(payload.cash_amount),
      onlineAmount: toNumber(payload.online_amount),
      exchangeModel: payload.exchange_model,
      gotAmount: toNumber(payload.got_amount),
      gift: payload.gift,
      salespersonName: payload.salesperson_name,
      attendedBy: payload.attended_by_employee_id || undefined,
      customerSource: payload.customer_source || "walk_in",
      referredByEmployee: payload.referred_by_employee_id || undefined,
      referralNotes: payload.referral_notes || undefined,
      note: payload.notes,
      items: payload.items.map((item) => ({
        productId: item.product,
        quantity: item.quantity,
      })),
      payments: buildPayments(payload),
    }),
  });

  return mapSaleDetailToApiSale(result);
}

export async function updateSale(id: string, payload: Partial<CreateSalePayload>): Promise<ApiSale> {
  const result = await apiRequest<BackendSaleDetailResponse>(`/sales/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(payload.customer !== undefined ? { customerId: payload.customer } : {}),
      ...(payload.store_ref !== undefined ? { storeId: payload.store_ref } : {}),
      ...(payload.cash_amount !== undefined ? { cashAmount: toNumber(payload.cash_amount) } : {}),
      ...(payload.online_amount !== undefined ? { onlineAmount: toNumber(payload.online_amount) } : {}),
      ...(payload.notes !== undefined ? { note: payload.notes } : {}),
    }),
  });

  return mapSaleDetailToApiSale(result);
}

export async function deleteSale(id: string): Promise<void> {
  await apiRequest<void>(`/sales/${id}`, { method: "DELETE" });
}

function normalizeBuybackRow(row: ApiBuyback): ApiBuyback {
  return {
    ...row,
    id: String(row.id),
    imei: String(row.imei || ""),
    serial_number: row.serial_number ? String(row.serial_number) : "",
    brand: row.brand || "",
    model: row.model || "",
    variant: row.variant || "",
    color: row.color || "",
    storage: row.storage || "",
    ram: row.ram || "",
    customer: row.customer === null || row.customer === undefined ? null : String(row.customer),
    customer_name: row.customer_name || "",
    customer_phone: row.customer_phone || "",
    store_ref: row.store_ref === null || row.store_ref === undefined ? null : String(row.store_ref),
    store_name: row.store_name || "",
    assigned_store_ref: row.assigned_store_ref === null || row.assigned_store_ref === undefined ? null : String(row.assigned_store_ref),
    assigned_store_name: row.assigned_store_name || "",
    assigned_technician: row.assigned_technician === null || row.assigned_technician === undefined ? null : String(row.assigned_technician),
    assigned_technician_name: row.assigned_technician_name || "",
    rack_location: row.rack_location || "",
    condition: row.condition || "Good",
    condition_grade: row.condition_grade || row.condition || "Good",
    market_value: toMoney(row.market_value),
    condition_deduction: toMoney(row.condition_deduction),
    repair_deduction: toMoney(row.repair_deduction),
    final_valuation: toMoney(row.final_valuation),
    negotiated_price: toMoney(row.negotiated_price),
    exchange_credit_amount: toMoney(row.exchange_credit_amount),
    cash_payout_amount: toMoney(row.cash_payout_amount),
    suggested_resale_price: toMoney(row.suggested_resale_price),
    expected_profit_margin: Number(row.expected_profit_margin || 0),
    exchange_credit_enabled: Boolean(row.exchange_credit_enabled),
    payout_method: row.payout_method || "cash",
    linked_sale_id: row.linked_sale_id === null || row.linked_sale_id === undefined ? null : String(row.linked_sale_id),
    resale_customer: row.resale_customer === null || row.resale_customer === undefined ? null : String(row.resale_customer),
    resale_sale_id: row.resale_sale_id === null || row.resale_sale_id === undefined ? null : String(row.resale_sale_id),
    notes: row.notes || "",
    inspection_notes: row.inspection_notes || "",
    pricing_notes: row.pricing_notes || "",
    repair_notes: row.repair_notes || "",
    resale_notes: row.resale_notes || "",
    status: row.status || "Pending Inspection",
    status_key: row.status_key || "pending_inspection",
    inspection_completed_at: row.inspection_completed_at || null,
    approved_at: row.approved_at || null,
    rejected_at: row.rejected_at || null,
    repair_started_at: row.repair_started_at || null,
    repair_completed_at: row.repair_completed_at || null,
    reserved_at: row.reserved_at || null,
    sold_at: row.sold_at || null,
    transfer_history: row.transfer_history || [],
    inventory_product: row.inventory_product === null || row.inventory_product === undefined ? null : String(row.inventory_product),
    created_by: row.created_by === null || row.created_by === undefined ? null : String(row.created_by),
    updated_by: row.updated_by === null || row.updated_by === undefined ? null : String(row.updated_by),
    approved_by: row.approved_by === null || row.approved_by === undefined ? null : String(row.approved_by),
    rejected_by: row.rejected_by === null || row.rejected_by === undefined ? null : String(row.rejected_by),
    deleted_by: row.deleted_by === null || row.deleted_by === undefined ? null : String(row.deleted_by),
    is_deleted: Boolean(row.is_deleted),
    deleted_at: row.deleted_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    days_in_inventory: Number(row.days_in_inventory || 0),
    physical_inspection: row.physical_inspection || {},
    functional_inspection: row.functional_inspection || {},
    damage_detection: row.damage_detection || {},
  };
}

function toBuybackPayload(payload: Partial<CreateBuybackPayload> & { status?: BuybackWorkflowStatus }): Record<string, unknown> {
  return {
    ...(payload.imei !== undefined ? { imei: payload.imei } : {}),
    ...(payload.serial_number !== undefined ? { serial_number: payload.serial_number } : {}),
    ...(payload.customer !== undefined ? { customer: payload.customer } : {}),
    ...(payload.store_ref !== undefined ? { store_ref: payload.store_ref } : {}),
    ...(payload.assigned_store_ref !== undefined ? { assigned_store_ref: payload.assigned_store_ref } : {}),
    ...(payload.assigned_technician !== undefined ? { assigned_technician: payload.assigned_technician } : {}),
    ...(payload.brand !== undefined ? { brand: payload.brand } : {}),
    ...(payload.model !== undefined ? { model: payload.model } : {}),
    ...(payload.variant !== undefined ? { variant: payload.variant } : {}),
    ...(payload.color !== undefined ? { color: payload.color } : {}),
    ...(payload.storage !== undefined ? { storage: payload.storage } : {}),
    ...(payload.ram !== undefined ? { ram: payload.ram } : {}),
    ...(payload.battery_health !== undefined ? { battery_health: payload.battery_health } : {}),
    ...(payload.accessories_received !== undefined ? { accessories_received: payload.accessories_received } : {}),
    ...(payload.box_available !== undefined ? { box_available: payload.box_available } : {}),
    ...(payload.charger_available !== undefined ? { charger_available: payload.charger_available } : {}),
    ...(payload.physical_inspection !== undefined ? { physical_inspection: payload.physical_inspection } : {}),
    ...(payload.functional_inspection !== undefined ? { functional_inspection: payload.functional_inspection } : {}),
    ...(payload.damage_detection !== undefined ? { damage_detection: payload.damage_detection } : {}),
    ...(payload.condition !== undefined ? { condition: payload.condition } : {}),
    ...(payload.market_value !== undefined ? { market_value: toNumber(payload.market_value) } : {}),
    ...(payload.condition_deduction !== undefined ? { condition_deduction: toNumber(payload.condition_deduction) } : {}),
    ...(payload.repair_deduction !== undefined ? { repair_deduction: toNumber(payload.repair_deduction) } : {}),
    ...(payload.final_valuation !== undefined ? { final_valuation: toNumber(payload.final_valuation) } : {}),
    ...(payload.negotiated_price !== undefined ? { negotiated_price: toNumber(payload.negotiated_price) } : {}),
    ...(payload.exchange_credit_amount !== undefined ? { exchange_credit_amount: toNumber(payload.exchange_credit_amount) } : {}),
    ...(payload.cash_payout_amount !== undefined ? { cash_payout_amount: toNumber(payload.cash_payout_amount) } : {}),
    ...(payload.suggested_resale_price !== undefined ? { suggested_resale_price: toNumber(payload.suggested_resale_price) } : {}),
    ...(payload.expected_profit_margin !== undefined ? { expected_profit_margin: toNumber(payload.expected_profit_margin) } : {}),
    ...(payload.exchange_credit_enabled !== undefined ? { exchange_credit_enabled: payload.exchange_credit_enabled } : {}),
    ...(payload.payout_method !== undefined ? { payout_method: payload.payout_method } : {}),
    ...(payload.linked_sale_id !== undefined ? { linked_sale_id: payload.linked_sale_id } : {}),
    ...(payload.rack_location !== undefined ? { rack_location: payload.rack_location } : {}),
    ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
    ...(payload.inspection_notes !== undefined ? { inspection_notes: payload.inspection_notes } : {}),
    ...(payload.pricing_notes !== undefined ? { pricing_notes: payload.pricing_notes } : {}),
    ...(payload.repair_notes !== undefined ? { repair_notes: payload.repair_notes } : {}),
    ...(payload.resale_notes !== undefined ? { resale_notes: payload.resale_notes } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
  };
}

export async function listBuybacks(): Promise<ApiBuyback[]> {
  const result = await apiRequest<{ rows: ApiBuyback[] }>("/buybacks");
  return result.rows.map(normalizeBuybackRow);
}

export async function listBuybacksPage(params: BuybackListParams = {}): Promise<BuybackListResponse> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  const result = await apiRequest<BuybackListResponse>(`/buybacks${query ? `?${query}` : ""}`);
  return {
    ...result,
    rows: (result.rows || []).map(normalizeBuybackRow),
  };
}

export async function createBuyback(payload: CreateBuybackPayload): Promise<ApiBuyback> {
  const row = await apiRequest<ApiBuyback>("/buybacks", {
    method: "POST",
    body: JSON.stringify(toBuybackPayload(payload)),
  });

  return normalizeBuybackRow(row);
}

export async function updateBuyback(id: string, payload: Partial<CreateBuybackPayload> & { status?: BuybackWorkflowStatus }): Promise<ApiBuyback> {
  const row = await apiRequest<ApiBuyback>(`/buybacks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(toBuybackPayload(payload)),
  });

  return normalizeBuybackRow(row);
}

export async function deleteBuyback(id: string): Promise<void> {
  await apiRequest<void>(`/buybacks/${id}`, { method: "DELETE" });
}

export async function listRepairs(): Promise<ApiRepairTicket[]> {
  const result = await apiRequest<{ rows: ApiRepairTicket[] }>("/repairs");
  return result.rows.map((entry) => ({
    ...entry,
    id: String(entry.id),
    customer: entry.customer === null || entry.customer === undefined ? null : String(entry.customer),
    store_ref: entry.store_ref === null || entry.store_ref === undefined ? null : String(entry.store_ref),
    parts: entry.parts || [],
  }));
}

export async function createRepair(payload: CreateRepairPayload): Promise<ApiRepairTicket> {
  const row = await apiRequest<ApiRepairTicket>("/repairs", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      parts_charge: toNumber(payload.parts_charge),
      labor_cost: toNumber(payload.labor_cost),
      got_amount: toNumber(payload.got_amount),
      in_cash: toNumber(payload.in_cash),
      in_online: toNumber(payload.in_online),
      out_cash: toNumber(payload.out_cash),
      out_online: toNumber(payload.out_online),
    }),
  });

  return {
    ...row,
    id: String(row.id),
    customer: row.customer === null || row.customer === undefined ? null : String(row.customer),
    store_ref: row.store_ref === null || row.store_ref === undefined ? null : String(row.store_ref),
  };
}

export async function updateRepair(id: number, payload: Partial<CreateRepairPayload>): Promise<ApiRepairTicket> {
  const row = await apiRequest<ApiRepairTicket>(`/repairs/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...payload,
      ...(payload.parts_charge !== undefined ? { parts_charge: toNumber(payload.parts_charge) } : {}),
      ...(payload.labor_cost !== undefined ? { labor_cost: toNumber(payload.labor_cost) } : {}),
      ...(payload.got_amount !== undefined ? { got_amount: toNumber(payload.got_amount) } : {}),
      ...(payload.in_cash !== undefined ? { in_cash: toNumber(payload.in_cash) } : {}),
      ...(payload.in_online !== undefined ? { in_online: toNumber(payload.in_online) } : {}),
      ...(payload.out_cash !== undefined ? { out_cash: toNumber(payload.out_cash) } : {}),
      ...(payload.out_online !== undefined ? { out_online: toNumber(payload.out_online) } : {}),
    }),
  });

  return {
    ...row,
    id: String(row.id),
    customer: row.customer === null || row.customer === undefined ? null : String(row.customer),
    store_ref: row.store_ref === null || row.store_ref === undefined ? null : String(row.store_ref),
  };
}

export async function deleteRepair(id: number): Promise<void> {
  await apiRequest<void>(`/repairs/${id}`, { method: "DELETE" });
}

export async function listExpenses(): Promise<ApiExpense[]> {
  const result = await apiRequest<{ rows: ApiExpense[] }>("/expenses");
  return result.rows.map((entry) => ({
    ...entry,
    id: String(entry.id),
    store_ref: entry.store_ref === null || entry.store_ref === undefined ? null : String(entry.store_ref),
  }));
}

export async function createExpense(payload: CreateExpensePayload): Promise<ApiExpense> {
  const row = await apiRequest<ApiExpense>("/expenses", {
    method: "POST",
    body: JSON.stringify({
      store_ref: payload.store_ref ?? null,
      reason: payload.reason,
      out_cash: toNumber(payload.out_cash),
      out_online: toNumber(payload.out_online),
      expense_date: payload.expense_date,
      notes: payload.notes,
    }),
  });

  return {
    ...row,
    id: String(row.id),
    store_ref: row.store_ref === null || row.store_ref === undefined ? null : String(row.store_ref),
  };
}

export async function updateExpense(id: number, payload: Partial<CreateExpensePayload>): Promise<ApiExpense> {
  const row = await apiRequest<ApiExpense>(`/expenses/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(payload.store_ref !== undefined ? { store_ref: payload.store_ref } : {}),
      ...(payload.reason !== undefined ? { reason: payload.reason } : {}),
      ...(payload.out_cash !== undefined ? { out_cash: toNumber(payload.out_cash) } : {}),
      ...(payload.out_online !== undefined ? { out_online: toNumber(payload.out_online) } : {}),
      ...(payload.expense_date !== undefined ? { expense_date: payload.expense_date } : {}),
      ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
    }),
  });

  return {
    ...row,
    id: String(row.id),
    store_ref: row.store_ref === null || row.store_ref === undefined ? null : String(row.store_ref),
  };
}

export async function deleteExpense(id: number): Promise<void> {
  await apiRequest<void>(`/expenses/${id}`, { method: "DELETE" });
}

export async function listPaymentEntries(): Promise<ApiPaymentEntry[]> {
  const result = await apiRequest<{ rows: ApiPaymentEntry[] }>("/payments");
  return result.rows.map((entry) => ({
    ...entry,
    id: String(entry.id),
    store_ref: entry.store_ref === null || entry.store_ref === undefined ? null : String(entry.store_ref),
    source_id: entry.source_id === null || entry.source_id === undefined ? null : String(entry.source_id),
  }));
}

export async function createPaymentEntry(payload: CreatePaymentEntryPayload): Promise<ApiPaymentEntry> {
  const row = await apiRequest<ApiPaymentEntry>("/payments", {
    method: "POST",
    body: JSON.stringify({
      store_ref: payload.store_ref ?? null,
      entry_type: payload.entry_type,
      dealer_name: payload.dealer_name,
      cash_amount: toNumber(payload.cash_amount),
      online_amount: toNumber(payload.online_amount),
      payment_status: payload.payment_status,
      outstanding_amount: payload.outstanding_amount !== undefined ? toNumber(payload.outstanding_amount) : undefined,
      entry_date: payload.entry_date,
      source_type: payload.source_type,
      source_id: payload.source_id,
      notes: payload.notes,
    }),
  });

  return {
    ...row,
    id: String(row.id),
    store_ref: row.store_ref === null || row.store_ref === undefined ? null : String(row.store_ref),
    source_id: row.source_id === null || row.source_id === undefined ? null : String(row.source_id),
  };
}

export async function updatePaymentEntry(id: number, payload: Partial<CreatePaymentEntryPayload>): Promise<ApiPaymentEntry> {
  const row = await apiRequest<ApiPaymentEntry>(`/payments/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(payload.store_ref !== undefined ? { store_ref: payload.store_ref } : {}),
      ...(payload.entry_type !== undefined ? { entry_type: payload.entry_type } : {}),
      ...(payload.dealer_name !== undefined ? { dealer_name: payload.dealer_name } : {}),
      ...(payload.cash_amount !== undefined ? { cash_amount: toNumber(payload.cash_amount) } : {}),
      ...(payload.online_amount !== undefined ? { online_amount: toNumber(payload.online_amount) } : {}),
      ...(payload.payment_status !== undefined ? { payment_status: payload.payment_status } : {}),
      ...(payload.outstanding_amount !== undefined ? { outstanding_amount: toNumber(payload.outstanding_amount) } : {}),
      ...(payload.entry_date !== undefined ? { entry_date: payload.entry_date } : {}),
      ...(payload.source_type !== undefined ? { source_type: payload.source_type } : {}),
      ...(payload.source_id !== undefined ? { source_id: payload.source_id } : {}),
      ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
    }),
  });

  return {
    ...row,
    id: String(row.id),
    store_ref: row.store_ref === null || row.store_ref === undefined ? null : String(row.store_ref),
    source_id: row.source_id === null || row.source_id === undefined ? null : String(row.source_id),
  };
}

export async function deletePaymentEntry(id: number): Promise<void> {
  await apiRequest<void>(`/payments/${id}`, { method: "DELETE" });
}

export async function listOutstandingBalances(): Promise<ApiOutstandingBalance[]> {
  const result = await apiRequest<{ rows: ApiOutstandingBalance[] }>("/payments/outstanding");
  return result.rows.map((entry) => ({
    ...entry,
    source_id: String(entry.source_id),
    store_ref: entry.store_ref === null || entry.store_ref === undefined ? null : String(entry.store_ref),
  }));
}

function resolveDateRange(period: ReportPeriod, from?: string, to?: string): { start: string; end: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (period === "custom") {
    if (!from || !to) throw new ApiError(400, "Custom range requires from and to dates.", "VALIDATION_ERROR");
    return { start: from, end: to };
  }

  if (period === "daily") {
    return { start: today, end: today };
  }

  if (period === "weekly") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { start: start.toISOString().slice(0, 10), end: today };
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return { start: monthStart, end: today };
}

function dateInRange(dateIso: string, start: string, end: string): boolean {
  const d = dateIso.slice(0, 10);
  return d >= start && d <= end;
}

function monthEndIso(month: string): string {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 1 || monthIndex > 12) {
    throw new ApiError(400, "Invalid month format. Expected YYYY-MM", "VALIDATION_ERROR");
  }
  const end = new Date(year, monthIndex, 0);
  return end.toISOString().slice(0, 10);
}

export async function getReportData(params: ReportFilters): Promise<ReportDataResponse> {
  const [sales, stores, products] = await Promise.all([listSales(), listStores(), listProducts()]);
  const { start, end } = resolveDateRange(params.period, params.from, params.to);
  const storeFilter = resolveStoreFilter(params.store, stores);

  const filteredSales = sales.filter((entry) => {
    const inDate = dateInRange(entry.sold_at, start, end);
    const inStore = storeFilter ? entry.store_ref === storeFilter : true;
    return inDate && inStore;
  });

  if (params.type === "sales") {
    const grouped = new Map<string, SalesReportRow>();
    filteredSales.forEach((sale) => {
      const date = sale.sold_at.slice(0, 10);
      const row = grouped.get(date) || { date, transactions: 0, unitsSold: 0, revenue: 0 };
      row.transactions += 1;
      row.unitsSold += sale.items.reduce((sum, item) => sum + item.quantity, 0);
      row.revenue += toNumber(sale.total_amount);
      grouped.set(date, row);
    });

    const rows = Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
    return { type: "sales", period: params.period, from: start, to: end, store: storeFilter, rows };
  }

  if (params.type === "product") {
    const productMap = new Map<number, ApiProduct>();
    products.forEach((product) => productMap.set(product.id, product));

    const grouped = new Map<number, ProductReportRow>();
    filteredSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const product = productMap.get(item.product);
        const row = grouped.get(item.product) || {
          productId: item.product,
          sku: product?.sku || "",
          productName: product?.name || `Product ${item.product}`,
          transactions: 0,
          unitsSold: 0,
          revenue: 0,
        };
        row.transactions += 1;
        row.unitsSold += item.quantity;
        row.revenue += item.quantity * toNumber(item.unit_price);
        grouped.set(item.product, row);
      });
    });

    const rows = Array.from(grouped.values()).sort((a, b) => b.revenue - a.revenue);
    return { type: "product", period: params.period, from: start, to: end, store: storeFilter, rows };
  }

  const storeMap = new Map<number, ApiStore>();
  stores.forEach((store) => storeMap.set(store.id, store));

  const grouped = new Map<number | null, StoreReportRow>();
  filteredSales.forEach((sale) => {
    const key = sale.store_ref ?? null;
    const storeName = key ? (storeMap.get(key)?.name || `Store ${key}`) : "Unassigned Store";
    const row = grouped.get(key) || { storeId: key, storeName, transactions: 0, unitsSold: 0, revenue: 0 };
    row.transactions += 1;
    row.unitsSold += sale.items.reduce((sum, item) => sum + item.quantity, 0);
    row.revenue += toNumber(sale.total_amount);
    grouped.set(key, row);
  });

  const rows = Array.from(grouped.values()).sort((a, b) => b.revenue - a.revenue);
  return { type: "store", period: params.period, from: start, to: end, store: storeFilter, rows };
}

function csvEscape(value: string | number | null | undefined): string {
  const original = String(value ?? "");
  const trimmedStart = original.trimStart();
  const text = /^[=+\-@]/.test(trimmedStart) || original.startsWith("\t") || original.startsWith("\r")
    ? `'${original}`
    : original;
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const all = [headers, ...rows.map((row) => row.map((cell) => csvEscape(cell)))];
  return all.map((line) => line.join(",")).join("\n");
}

export async function downloadReportFile(params: ReportFilters, format: "csv" | "xlsx"): Promise<Blob> {
  const data = await getReportData(params);
  let headers: string[] = [];
  let rows: Array<Array<string | number>> = [];

  if (data.type === "sales") {
    headers = ["Date", "Transactions", "Units Sold", "Revenue"];
    rows = (data.rows as SalesReportRow[]).map((row) => [row.date, row.transactions, row.unitsSold, toMoney(row.revenue)]);
  } else if (data.type === "product") {
    headers = ["Product ID", "SKU", "Product Name", "Transactions", "Units Sold", "Revenue"];
    rows = (data.rows as ProductReportRow[]).map((row) => [row.productId, row.sku, row.productName, row.transactions, row.unitsSold, toMoney(row.revenue)]);
  } else {
    headers = ["Store ID", "Store Name", "Transactions", "Units Sold", "Revenue"];
    rows = (data.rows as StoreReportRow[]).map((row) => [row.storeId ?? "", row.storeName, row.transactions, row.unitsSold, toMoney(row.revenue)]);
  }

  if (format === "xlsx") {
    const tsv = [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n");
    return new Blob([`\uFEFF${tsv}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
  }

  const csv = toCsv(headers, rows);
  return new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
}

export async function downloadBriefReportCSV(params: BriefReportParams): Promise<Blob> {
  const section = (params.section || "overall").toLowerCase();
  const from = params.month ? `${params.month}-01` : (params.from || new Date(Date.now() - (6 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10));
  const to = params.month ? monthEndIso(params.month) : (params.to || new Date().toISOString().slice(0, 10));

  const [stores, report] = await Promise.all([
    listStores(),
    getReportData({
      type: "sales",
      period: "custom",
      from,
      to,
      store: params.store,
    }),
  ]);

  const storeId = resolveStoreFilter(params.store, stores);
  const storeNameById = new Map<number, string>();
  stores.forEach((entry) => storeNameById.set(entry.id, entry.name));

  const withinStore = (entryStore: number | null | undefined): boolean => (storeId ? entryStore === storeId : true);
  const withinRange = (dateIso: string): boolean => dateInRange(dateIso, from, to);

  let headers: string[] = [];
  let rows: Array<Array<string | number>> = [];

  if (section === "sales") {
    headers = ["Date", "Transactions", "Units Sold", "Revenue"];
    rows = (report.rows as SalesReportRow[]).map((row) => [row.date, row.transactions, row.unitsSold, toMoney(row.revenue)]);
  } else if (section === "accessories") {
    headers = ["Date", "Product", "Quantity", "Revenue"];
    const [sales, products] = await Promise.all([listSales(), listProducts()]);
    const productMap = new Map<number, ApiProduct>();
    products.forEach((product) => productMap.set(product.id, product));

    rows = sales
      .filter((sale) => withinRange(sale.sold_at) && withinStore(sale.store_ref))
      .flatMap((sale) => sale.items
        .filter((item) => productMap.get(item.product)?.category === "accessories")
        .map((item) => {
          const product = productMap.get(item.product);
          return [
            sale.sold_at.slice(0, 10),
            product?.name || `Product ${item.product}`,
            item.quantity,
            toMoney(item.quantity * toNumber(item.unit_price)),
          ];
        })
      );
  } else if (section === "buybacks") {
    headers = ["Date", "Store", "IMEI", "Device", "Offer", "Status"];
    const buybacks = await listBuybacks();
    rows = buybacks
      .filter((entry) => withinRange(entry.created_at) && withinStore(entry.store_ref))
      .map((entry) => [
        entry.created_at.slice(0, 10),
        entry.store_ref ? (storeNameById.get(entry.store_ref) || `Store ${entry.store_ref}`) : "-",
        entry.imei,
        `${entry.brand} ${entry.model}`.trim(),
        toMoney(entry.negotiated_price),
        entry.status,
      ]);
  } else if (section === "repairs") {
    headers = ["Date", "Ticket", "Customer", "Status", "Total Due", "Paid", "Outstanding"];
    const repairs = await listRepairs();
    rows = repairs
      .filter((entry) => withinRange(entry.created_at) && withinStore(entry.store_ref))
      .map((entry) => {
        const totalDue = toNumber(entry.parts_charge) + toNumber(entry.labor_cost);
        const paid = toNumber(entry.got_amount) + toNumber(entry.in_cash) + toNumber(entry.in_online);
        const outstanding = Math.max(0, totalDue - paid);
        return [
          entry.created_at.slice(0, 10),
          entry.ticket_no,
          entry.customer_name,
          entry.status,
          toMoney(totalDue),
          toMoney(paid),
          toMoney(outstanding),
        ];
      });
  } else if (section === "expenses") {
    headers = ["Date", "Store", "Reason", "Cash Out", "Online Out", "Total"];
    const expenses = await listExpenses();
    rows = expenses
      .filter((entry) => withinRange(entry.expense_date) && withinStore(entry.store_ref))
      .map((entry) => [
        entry.expense_date,
        entry.store_ref ? (storeNameById.get(entry.store_ref) || `Store ${entry.store_ref}`) : "-",
        entry.reason,
        toMoney(entry.out_cash),
        toMoney(entry.out_online),
        toMoney(toNumber(entry.out_cash) + toNumber(entry.out_online)),
      ]);
  } else if (section === "payments") {
    headers = ["Source", "Reference", "Party", "Type/Status", "Paid", "Outstanding", "Date"];
    const [entries, outstanding] = await Promise.all([listPaymentEntries(), listOutstandingBalances()]);

    const entryRows = entries
      .filter((entry) => withinRange(entry.entry_date) && withinStore(entry.store_ref))
      .map((entry) => [
        "Manual Entry",
        entry.source_id ? `${entry.source_type || "manual"}#${entry.source_id}` : "-",
        entry.dealer_name,
        `${entry.entry_type.toUpperCase()} | ${entry.payment_status || "paid"}`,
        toMoney(toNumber(entry.cash_amount) + toNumber(entry.online_amount)),
        toMoney(entry.outstanding_amount || 0),
        entry.entry_date,
      ]);

    const outstandingRows = outstanding
      .filter((entry) => withinRange(entry.created_at) && withinStore(entry.store_ref))
      .map((entry) => [
        entry.source_type.toUpperCase(),
        entry.reference_no,
        entry.party_name,
        entry.payment_status,
        toMoney(entry.paid_amount),
        toMoney(entry.outstanding_amount),
        entry.created_at.slice(0, 10),
      ]);

    rows = [...entryRows, ...outstandingRows];
  } else if (section === "inventory") {
    headers = ["SKU", "Product Name", "Stock", "Price"];
    const products = await listProducts(storeId || undefined);
    rows = products.map((product) => [product.sku, product.name, product.stock_quantity, toMoney(product.price)]);
  } else if (section === "customers") {
    headers = ["Customer Name", "Phone", "Email", "Purchases", "Spent"];
    const [customers, sales] = await Promise.all([listCustomers(), listSales()]);
    rows = customers
      .filter((customer) => withinStore(customer.store_ref))
      .map((customer) => {
        const customerSales = sales.filter((sale) => sale.customer === customer.id && withinRange(sale.sold_at) && withinStore(sale.store_ref));
        const spent = customerSales.reduce((sum, sale) => sum + toNumber(sale.total_amount), 0);
        return [customer.name, customer.phone, customer.email, customerSales.length, toMoney(spent)];
      });
  } else {
    const [buybacks, repairs, expenses, outstanding] = await Promise.all([
      listBuybacks(),
      listRepairs(),
      listExpenses(),
      listOutstandingBalances(),
    ]);

    const salesRows = report.rows as SalesReportRow[];
    const totalRevenue = salesRows.reduce((sum, row) => sum + row.revenue, 0);
    const totalTransactions = salesRows.reduce((sum, row) => sum + row.transactions, 0);
    const buybackCost = buybacks
      .filter((entry) => withinRange(entry.created_at) && withinStore(entry.store_ref))
      .reduce((sum, entry) => sum + toNumber(entry.cash_amount) + toNumber(entry.online_amount), 0);
    const repairRevenue = repairs
      .filter((entry) => withinRange(entry.created_at) && withinStore(entry.store_ref))
      .reduce((sum, entry) => sum + toNumber(entry.in_cash) + toNumber(entry.in_online), 0);
    const expenseTotal = expenses
      .filter((entry) => withinRange(entry.expense_date) && withinStore(entry.store_ref))
      .reduce((sum, entry) => sum + toNumber(entry.out_cash) + toNumber(entry.out_online), 0);
    const outstandingTotal = outstanding
      .filter((entry) => withinRange(entry.created_at) && withinStore(entry.store_ref))
      .reduce((sum, entry) => sum + toNumber(entry.outstanding_amount), 0);

    headers = ["Metric", "Value"];
    rows = [
      ["From Date", from],
      ["To Date", to],
      ["Store Filter", storeId ? (storeNameById.get(storeId) || `Store ${storeId}`) : "All Stores"],
      ["Sales Transactions", totalTransactions],
      ["Sales Revenue", toMoney(totalRevenue)],
      ["Buyback Payout", toMoney(buybackCost)],
      ["Repair Collected", toMoney(repairRevenue)],
      ["Expense Outflow", toMoney(expenseTotal)],
      ["Outstanding Balance", toMoney(outstandingTotal)],
      ["Net Cash Position", toMoney(totalRevenue + repairRevenue - buybackCost - expenseTotal)],
    ];
  }

  const csv = toCsv(headers, rows);
  return new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
}

export async function lookupSaleJob(jobNumber: string): Promise<JobLookupResponse> {
  const encoded = encodeURIComponent(jobNumber.trim());
  const result = await apiRequest<JobLookupResponse>(`/sales/job-lookup/${encoded}`);
  return {
    ...result,
    sale: result.sale || null,
    product: result.product ? mapApiProduct(result.product) : null,
    customer: result.customer ? { ...result.customer, id: String(result.customer.id) } : null,
    inventory: (result.inventory || []).map((row) => ({
      ...row,
      store_id: String(row.store_id),
      product_id: String(row.product_id),
      unit_price: toMoney(row.unit_price),
    })),
    buyback: result.buyback ? normalizeBuybackRow(result.buyback) : null,
    repair: result.repair ? {
      ...result.repair,
      id: String(result.repair.id),
      customer: result.repair.customer === null || result.repair.customer === undefined ? null : String(result.repair.customer),
      store_ref: result.repair.store_ref === null || result.repair.store_ref === undefined ? null : String(result.repair.store_ref),
      parts: result.repair.parts || [],
    } : null,
    payments: (result.payments || []).map((entry) => ({
      ...entry,
      amount: toMoney(entry.amount),
    })),
  };
}

export async function getAdminReportOverview(params: AdminOverviewFilters): Promise<AdminOverviewResponse> {
  const query = new URLSearchParams();
  if (params.quickRange) query.set("quickRange", params.quickRange);
  if (params.fromDate) query.set("fromDate", params.fromDate);
  if (params.toDate) query.set("toDate", params.toDate);
  if (params.storeIds?.length) query.set("storeIds", params.storeIds.join(","));
  const res = await apiRequest<{ success: boolean; data: AdminOverviewResponse }>(`/reports/admin/overview?${query.toString()}`);
  return res.data;
}

export async function exportAdminReportPdf(params: AdminOverviewFilters): Promise<Blob> {
  const query = new URLSearchParams();
  if (params.quickRange) query.set("quickRange", params.quickRange);
  if (params.fromDate) query.set("fromDate", params.fromDate);
  if (params.toDate) query.set("toDate", params.toDate);
  if (params.storeIds?.length) query.set("storeIds", params.storeIds.join(","));
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}/reports/admin/export/pdf?${query.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError(response.status, "Failed to export PDF");
  return response.blob();
}
