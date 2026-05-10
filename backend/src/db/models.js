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
}, { timestamps: true });

const productSchema = new mongoose.Schema({
  sku: { type: String, required: true, unique: true, lowercase: true },
  jobId: { type: String, unique: true, sparse: true, index: true },
  productCode: { type: String, unique: true, sparse: true, index: true },
  barcode: { type: String, unique: true, sparse: true, index: true },
  imei: { type: String, sparse: true, unique: true },
  serialNumber: { type: String, sparse: true, unique: true },
  name: { type: String, required: true },
  brand: String,
  model: String,
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
  images: [String],
  remarks: String,
  deviceNotes: String,
  isActive: { type: Boolean, default: true },
  isGift: { type: Boolean, default: false },
  giftCategory: String,
  jobNumber: String,
  icNumber: String,
  icLocked: { type: Boolean, default: false },
}, { timestamps: true });

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
  marketValue: { type: Number, required: true, min: 0 },
  negotiatedPrice: { type: Number, required: true, min: 0 },
  status: { type: String, default: 'pending', enum: ['pending', 'accepted', 'processed', 'rejected'] },
  inventoryProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  notes: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const repairSchema = new mongoose.Schema({
  ticketNo: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  deviceModel: { type: String, required: true },
  problem: String,
  technicianName: String,
  serviceJobId: { type: String, unique: true, sparse: true, index: true },
  jobNumber: String,
  inventoryProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  status: { 
    type: String, 
    default: 'pending', 
    enum: ['pending', 'in_progress', 'completed', 'delivered', 'cancelled'] 
  },
  parts: [mongoose.Schema.Types.Mixed],
  partsCharge: { type: Number, default: 0, min: 0 },
  laborCost: { type: Number, default: 0, min: 0 },
  gotAmount: { type: Number, default: 0, min: 0 },
  inCash: { type: Number, default: 0, min: 0 },
  inOnline: { type: Number, default: 0, min: 0 },
  outCash: { type: Number, default: 0, min: 0 },
  outOnline: { type: Number, default: 0, min: 0 },
  paymentStatus: { type: String, default: 'pending', enum: ['pending', 'partial', 'paid'] },
  outstandingAmount: { type: Number, default: 0, min: 0 },
  warranty: { type: String, default: '3 months', enum: ['3 months', '6 months', '12 months'] },
  estimatedCompletion: Date,
  notes: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

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
    enum: ['sale', 'repair', 'buyback', 'expense', 'manual', null] 
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

const sequenceCounterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

export const Role = mongoose.model('Role', roleSchema);
export const User = mongoose.model('User', userSchema);
export const Store = mongoose.model('Store', storeSchema);
export const Employee = mongoose.model('Employee', employeeSchema);
export const Customer = mongoose.model('Customer', customerSchema);
export const Product = mongoose.model('Product', productSchema);
export const StoreInventory = mongoose.model('StoreInventory', storeInventorySchema);
export const StockLedger = mongoose.model('StockLedger', stockLedgerSchema);
export const StockMovement = StockLedger;
export const Sale = mongoose.model('Sale', saleSchema);
export const Buyback = mongoose.model('Buyback', buybackSchema);
export const Repair = mongoose.model('Repair', repairSchema);
export const Expense = mongoose.model('Expense', expenseSchema);
export const PaymentEntry = mongoose.model('PaymentEntry', paymentEntrySchema);
export const ChangeRequest = mongoose.model('ChangeRequest', changeRequestSchema);
export const Notification = mongoose.model('Notification', notificationSchema);
export const GiftTransaction = mongoose.model('GiftTransaction', giftTransactionSchema);
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export const ExportLog = mongoose.model('ExportLog', exportLogSchema);
export const StoreManagerAssignment = mongoose.model('StoreManagerAssignment', storeManagerAssignmentSchema);
export const SequenceCounter = mongoose.model('SequenceCounter', sequenceCounterSchema);

