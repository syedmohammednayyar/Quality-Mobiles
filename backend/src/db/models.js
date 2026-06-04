import mongoose from "mongoose";

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String,
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  fullName: { type: String },
  passwordHash: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }]
}, { timestamps: true });

const authSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  familyId: { type: String, required: true, index: true },
  deviceId: { type: String, index: true },
  userAgent: String,
  ipAddress: String,
  expiresAt: { type: Date, required: true },
  lastUsedAt: { type: Date, default: Date.now },
  revokedAt: Date,
  replacedByTokenHash: String,
}, { timestamps: true });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const storeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true, unique: true },
  parentStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const employeeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  fullName: { type: String, required: true },
  phone: String,
  commissionRate: { type: Number, default: 0, min: 0, max: 100 },
  isActive: { type: Boolean, default: true },
  hiredAt: Date,
}, { timestamps: true });

const customerSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  fullName: { type: String, required: true },
  phone: { type: String, sparse: true, unique: true },
  email: { type: String, sparse: true, unique: true, lowercase: true },
  sourceType: { type: String, enum: ["walk_in", "referred"], default: "walk_in" },
  referredByEmployee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  sourceNotes: String,
}, { timestamps: true });

const productSchema = new mongoose.Schema({
  sku: { type: String, required: true, unique: true, lowercase: true },
  jobId: { type: String, required: true, unique: true, index: true },
  productCode: { type: String, unique: true, sparse: true, index: true },
  barcode: { type: String, unique: true, sparse: true, index: true },
  imei: { type: String, sparse: true, unique: true },
  serialNumber: { type: String, sparse: true, unique: true },
  name: { type: String, required: true },
  brand: String,
  model: String,
  networkType: { type: String, enum: ['4G', '5G'], index: true },
  variant: String,
  ram: String,
  storage: String,
  color: String,
  condition: { type: String, default: 'new', enum: ['new', 'used', 'refurbished', 'open_box', 'damaged'] },
  category: { 
    type: String, 
    required: true, 
    enum: ['new_phone', 'used_phone', 'accessory', 'service', 'repair_part'] 
  },
  purchasePrice: { type: Number, default: 0, min: 0 },
  unitPrice: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  taxRate: { type: Number, default: 0, min: 0, max: 100 },
  supplierName: String,
  supplierContact: String,
  purchaseDate: Date,
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', index: true },
  storeName: String,
  images: [String],
  remarks: String,
  deviceNotes: String,
  inventoryStatus: { type: String, enum: ["ready", "sold"], default: "ready", index: true },
  inventoryMode: { type: String, enum: ["serialized", "bulk"], default: "bulk", index: true },
  isActive: { type: Boolean, default: true },
  isGift: { type: Boolean, default: false },
  giftCategory: String,
  jobNumber: String,
  categoryMaster: String,
  customSubCategory: String,
  ramVariant: String,
  storageVariant: String,
  serialNumber: String,
  batteryHealth: Number,
  accessoriesReceived: [String],
  boxAvailable: { type: Boolean, default: false },
  chargerAvailable: { type: Boolean, default: false },
  physicalInspection: mongoose.Schema.Types.Mixed,
  functionalInspection: mongoose.Schema.Types.Mixed,
  damageDetection: mongoose.Schema.Types.Mixed,
  conditionDeduction: { type: Number, default: 0, min: 0 },
  finalValuation: { type: Number, default: 0, min: 0 },
  suggestedResalePrice: { type: Number, default: 0, min: 0 },
  exchangeCreditAmount: { type: Number, default: 0, min: 0 },
  rackLocation: String,
  inspectionNotes: String,
  pricingNotes: String,
  resaleNotes: String,
  transferHistory: [mongoose.Schema.Types.Mixed],
  icNumber: String,
  icLocked: { type: Boolean, default: false },
}, { timestamps: true });
storeSchema.index({ code: 1, isActive: 1 });

productSchema.index({
  jobId: 'text',
  productCode: 'text',
  sku: 'text',
  barcode: 'text',
  imei: 'text',
  serialNumber: 'text',
  name: 'text',
  brand: 'text',
  model: 'text',
});

// Additional indexes to support new reporting and fast lookups
productSchema.index({ jobNumber: 1 });
productSchema.index({ supplierContact: 1 });
productSchema.index({ category: 1, customSubCategory: 1, categoryMaster: 1 });

const storeInventorySchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, unique: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, default: 0, min: 0 },
    reservedQuantity: { type: Number, default: 0, min: 0 },
    minStockLevel: { type: Number, default: 0, min: 0 },
    jobNumber: String,
  }]
}, { timestamps: true });

const stockLedgerSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  movementType: { 
    type: String, 
    required: true, 
    enum: ['in', 'out', 'adjustment', 'transfer_in', 'transfer_out', 'return'] 
  },
  quantity: { type: Number, required: true, min: 1 },
  referenceType: { type: String, required: true },
  referenceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reason: String,
  note: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

stockLedgerSchema.index({ store: 1, product: 1, createdAt: -1 });
stockLedgerSchema.index({ referenceType: 1, referenceId: 1 });

const serializedInventorySchema = new mongoose.Schema({
  serialId: { type: String, required: true, unique: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
  imei: { type: String, sparse: true, unique: true, index: true },
  serialNumber: { type: String, sparse: true, unique: true, index: true },
  barcode: { type: String, sparse: true, unique: true, index: true },
  jobNumber: { type: String, index: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  status: {
    type: String,
    enum: ["in_stock", "reserved", "sold", "transferred", "buyback_hold"],
    default: "in_stock",
    index: true,
  },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  notes: String,
}, { timestamps: true });
serializedInventorySchema.index({ store: 1, product: 1, status: 1, createdAt: -1 });

// Ensure serialized inventory job numbers are indexed for quick search
serializedInventorySchema.index({ jobNumber: 1 });

const bulkInventorySchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
  quantity: { type: Number, default: 0, min: 0 },
  reservedQuantity: { type: Number, default: 0, min: 0 },
  minStockLevel: { type: Number, default: 0, min: 0 },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
bulkInventorySchema.index({ store: 1, product: 1 }, { unique: true });

const saleSchema = new mongoose.Schema({
  saleNo: { type: String, required: true, unique: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  status: { type: String, default: 'completed', enum: ['draft', 'completed', 'cancelled'] },
  subtotal: { type: Number, required: true, min: 0 },
  taxTotal: { type: Number, required: true, min: 0 },
  discountTotal: { type: Number, default: 0, min: 0 },
  exchangeTotal: { type: Number, default: 0, min: 0 },
  grandTotal: { type: Number, required: true, min: 0 },
  amountPaid: { type: Number, default: 0, min: 0 },
  paymentStatus: { type: String, default: 'pending', enum: ['pending', 'partial', 'paid'] },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  }],
  payments: [{
    paymentMethod: { 
      type: String, 
      required: true, 
      enum: ['cash', 'card', 'bank_transfer', 'upi', 'wallet', 'mixed'] 
    },
    status: { type: String, required: true, enum: ['pending', 'partial', 'paid', 'failed', 'refunded'] },
    amount: { type: Number, required: true, min: 0 },
    referenceNo: String,
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paidAt: { type: Date, default: Date.now },
  }],
  note: String,
  jobNumber: String,
  icNumber: String,
  cashAmount: { type: Number, default: 0, min: 0 },
  onlineAmount: { type: Number, default: 0, min: 0 },
  exchangeModel: String,
  gotAmount: { type: Number, default: 0, min: 0 },
  gift: String,
  salespersonName: String,
  attendedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  customerSource: { type: String, enum: ["walk_in", "referred"], default: "walk_in" },
  referredByEmployee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  referralNotes: String,
  icLocked: { type: Boolean, default: false },
  transactionDate: { type: Date, default: Date.now },
}, { timestamps: true });

saleSchema.index({ store: 1, createdAt: -1 });
saleSchema.index({ saleNo: 1, jobNumber: 1 });

const buybackSchema = new mongoose.Schema({
  imei: { type: String, required: true, unique: true },
  brand: { type: String, required: true },
  model: { type: String, required: true },
  color: String,
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  jobNo: String,
  icNumber: String,
  cashAmount: { type: Number, default: 0, min: 0 },
  onlineAmount: { type: Number, default: 0, min: 0 },
  exchangeAmount: { type: Number, default: 0, min: 0 },
  exchangeModel: String,
  condition: { type: String, required: true, enum: ['excellent', 'good', 'fair', 'poor'] },
  conditionAssessed: { type: Boolean, default: false, index: true },
  customerName: String,
  dealerName: String,
  customerContactNumber: String,
  dealerContactNumber: String,
  ramVariant: String,
  storageVariant: String,
  payoutMethod: { type: String },
  serviceReadyStatus: { type: String },
  marketValue: { type: Number, required: true, min: 0 },
  negotiatedPrice: { type: Number, required: true, min: 0 },
  status: { type: String, default: 'pending', enum: ['pending', 'accepted', 'processed', 'rejected'] },
  inventoryProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  notes: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Index jobNo on buybacks and enforce uniqueness (sparse to allow existing nulls)
buybackSchema.index({ jobNo: 1 }, { unique: true, sparse: true });

const expenseSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  reason: { type: String, required: true },
  outCash: { type: Number, default: 0, min: 0 },
  outOnline: { type: Number, default: 0, min: 0 },
  expenseDate: { type: Date, required: true },
  notes: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const paymentEntrySchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  entryType: { type: String, required: true, enum: ['in', 'out'] },
  dealerName: { type: String, required: true },
  cashAmount: { type: Number, default: 0, min: 0 },
  onlineAmount: { type: Number, default: 0, min: 0 },
  paymentStatus: { type: String, default: 'paid', enum: ['pending', 'partial', 'paid'] },
  outstandingAmount: { type: Number, default: 0, min: 0 },
  entryDate: { type: Date, required: true },
  sourceType: { 
    type: String, 
    enum: ['sale', 'buyback', 'expense', 'manual', null] 
  },
  sourceId: mongoose.Schema.Types.ObjectId,
  notes: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const changeRequestSchema = new mongoose.Schema({
  entityType: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.Mixed, required: true },
  fieldName: { type: String, required: true },
  oldValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed,
  reason: String,
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: Date,
  rejectionReason: String,
}, { timestamps: true });

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  referenceType: String,
  referenceId: mongoose.Schema.Types.ObjectId,
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

const giftTransactionSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  quantity: { type: Number, required: true, min: 1 },
  transactionType: { type: String, required: true, enum: ['receive', 'issue'] },
  referenceType: String,
  referenceId: mongoose.Schema.Types.ObjectId,
  assignedTo: String,
  notes: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

const auditLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  entityType: String,
  entityId: mongoose.Schema.Types.Mixed,
  oldValues: mongoose.Schema.Types.Mixed,
  newValues: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ['success', 'failure'] },
  notes: String,
}, { timestamps: true });

const exportLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  exportType: { type: String, required: true },
  format: { type: String, required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  filters: mongoose.Schema.Types.Mixed,
  rowCount: Number,
}, { timestamps: true });

const storeManagerAssignmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
storeManagerAssignmentSchema.index({ user: 1, store: 1 }, { unique: true });

const employeeStoreAssignmentSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
  role: { type: String, required: true, enum: ["manager", "employee"] },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  assignedAt: { type: Date, default: Date.now },
  status: { type: String, required: true, default: "active", enum: ["active", "inactive"] },
}, { timestamps: true });
employeeStoreAssignmentSchema.index({ employee: 1, store: 1 }, { unique: true });
employeeStoreAssignmentSchema.index({ store: 1, role: 1, status: 1 });

const employeeCredentialSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  email: { type: String, required: true, lowercase: true, unique: true },
  passwordHash: { type: String, required: true },
  status: {
    type: String,
    required: true,
    default: "pending",
    enum: ["pending", "approved", "rejected", "suspended", "deactivated", "locked"],
  },
  approvalStatus: { type: String, required: true, default: "pending", enum: ["pending", "approved", "rejected"] },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  approvedAt: Date,
  rejectedReason: String,
  lastLogin: Date,
  loginAttempts: { type: Number, default: 0, min: 0 },
  accountLocked: { type: Boolean, default: false },
}, { timestamps: true });
employeeCredentialSchema.index({ status: 1, approvalStatus: 1, updatedAt: -1 });

const signupRequestSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  employeeName: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  phone: String,
  requestedRole: { type: String, required: true, enum: ["manager", "employee"] },
  requestedStore: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
  requestStatus: { type: String, required: true, default: "pending", enum: ["pending", "approved", "rejected"] },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date,
  rejectionReason: String,
}, { timestamps: true });
signupRequestSchema.index({ requestedStore: 1, requestStatus: 1, createdAt: -1 });

const sequenceCounterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

export const Role = mongoose.model('Role', roleSchema);
export const User = mongoose.model('User', userSchema);
export const AuthSession = mongoose.model("AuthSession", authSessionSchema);
export const Store = mongoose.model('Store', storeSchema);
export const Employee = mongoose.model('Employee', employeeSchema);
export const Customer = mongoose.model('Customer', customerSchema);
export const Product = mongoose.model('Product', productSchema);
export const ProductMaster = Product;
export const StoreInventory = mongoose.model('StoreInventory', storeInventorySchema);
export const SerializedInventory = mongoose.model("SerializedInventory", serializedInventorySchema);
export const BulkInventory = mongoose.model("BulkInventory", bulkInventorySchema);
export const StockLedger = mongoose.model('StockLedger', stockLedgerSchema);
export const StockMovement = StockLedger;
export const Sale = mongoose.model('Sale', saleSchema);
export const Buyback = mongoose.model('Buyback', buybackSchema);
export const Expense = mongoose.model('Expense', expenseSchema);
export const PaymentEntry = mongoose.model('PaymentEntry', paymentEntrySchema);
export const ChangeRequest = mongoose.model('ChangeRequest', changeRequestSchema);
export const Notification = mongoose.model('Notification', notificationSchema);
export const GiftTransaction = mongoose.model('GiftTransaction', giftTransactionSchema);
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export const ExportLog = mongoose.model('ExportLog', exportLogSchema);
export const StoreManagerAssignment = mongoose.model('StoreManagerAssignment', storeManagerAssignmentSchema);
export const EmployeeStoreAssignment = mongoose.model("EmployeeStoreAssignment", employeeStoreAssignmentSchema);
export const EmployeeCredential = mongoose.model("EmployeeCredential", employeeCredentialSchema);
export const SignupRequest = mongoose.model("SignupRequest", signupRequestSchema);
export const SequenceCounter = mongoose.model('SequenceCounter', sequenceCounterSchema);

