
// ==================== DESIGN SYSTEM ====================
export interface ThemeColors {
  primary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

// ==================== USER & AUTH ====================
export type UserRole = 'Admin' | 'Manager' | 'Employee';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  assignedStoreId?: string;
  avatar?: string;
  phone?: string;
  createdAt: string;
}

export const isPrivilegedUser = (user: Pick<User, 'role'> | null | undefined): boolean =>
  user?.role === 'Admin' || user?.role === 'Manager';

export const isSalesUser = (user: Pick<User, 'role'> | null | undefined): boolean =>
  user?.role === 'Admin' || user?.role === 'Manager';

// ==================== STORE MANAGEMENT ====================
export type StoreType = 'Main' | 'Secondary';

export interface Store {
  id: string;
  name: string;
  location: string;
  type: StoreType;
  manager?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
}

// ==================== PRODUCTS ====================
export type ProductCategory = 
  | 'New Phones' 
  | 'Used Phones' 
  | 'Accessories' 
  | 'Repair Parts' 
  | 'Repair Services' 
  | 'Wholesale';

export interface Product {
  id: string;
  barcode: string;
  name: string;
  brand: string;
  model: string;
  storage?: string;
  color?: string;
  purchasePrice: number;
  retailPrice: number;
  wholesalePrice?: number;
  minStockLevel: number;
  category: ProductCategory;
  image?: string;
  sku?: string;
  supplier?: string;
  createdAt: string;
}

// ==================== INVENTORY ====================
export interface StoreInventory {
  id: string;
  storeId: string;
  productId: string;
  quantity: number;
  minLevel: number;
  maxLevel: number;
  lastRestocked: string;
  lastUpdated: string;
}

export interface InventoryTransfer {
  id: string;
  fromStore: string;
  toStore: string;
  productId: string;
  quantity: number;
  reason: string;
  status: 'pending' | 'in-transit' | 'received';
  createdAt: string;
  completedAt?: string;
}

// ==================== POS & SALES ====================
export interface CartItem extends Product {
  cartQuantity: number;
  itemDiscount: number;
  storeId: string;
  variant?: string;
}

export type PaymentMethod = 'Cash' | 'Card' | 'UPI' | 'Bank Transfer' | 'Credit';

export interface Transaction {
  id: string;
  slNo: number;
  storeId: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  discount: number;
  exchangeCredit: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  cashPaid: number;
  onlinePaid: number;
  partialPayment?: boolean;
  change: number;
  salesperson: string;
  giftIncluded: boolean;
  status: 'completed' | 'pending' | 'cancelled';
  createdAt: string;
  notes?: string;
}

export interface SalesMetrics {
  date: string;
  revenue: number;
  transactions: number;
  avgTransaction: number;
  storeId?: string;
}

// ==================== BUYBACK ====================
export type BuybackCondition = 'Excellent' | 'Good' | 'Fair' | 'Poor';

export interface Buyback {
  id: string;
  storeId: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  device: {
    brand: string;
    model: string;
    imei: string;
    color?: string;
    storage?: string;
  };
  condition: BuybackCondition;
  marketValue: number;
  negotiatedPrice: number;
  repairRequired: boolean;
  repairCost?: number;
  notes?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'processed';
  linkedToSale?: string;
  technician?: string;
  createdAt: string;
  createdBy: string;
}

// ==================== REPAIRS & SERVICE ====================
export type RepairStatus = 'Pending' | 'In Progress' | 'Completed' | 'Delivered' | 'Cancelled';

export interface ServiceTicket {
  id: string;
  ticketNumber: string;
  storeId: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  device: {
    brand: string;
    model: string;
    imei?: string;
    color?: string;
  };
  problem: string;
  technician: string;
  assignedDate: string;
  status: RepairStatus;
  parts: RepairPart[];
  laborCost: number;
  totalCost: number;
  warranty?: string;
  completedDate?: string;
  notes?: string;
  createdAt: string;
}

export interface RepairPart {
  id: string;
  name: string;
  cost: number;
  quantity: number;
}

// ==================== FINANCIAL ====================
export interface FinancialMetrics {
  period: string;
  revenue: number;
  expenses: number;
  profit: number;
  storeId?: string;
}

export interface Receivable {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  daysOutstanding: number;
  transactionId: string;
  status: 'current' | '30-days' | '60-days' | '90+days';
  createdAt: string;
}

export interface Payable {
  id: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  daysOutstanding: number;
  status: 'current' | '30-days' | '60-days' | '90+days';
  dueDate: string;
  createdAt: string;
}

export interface KpiData {
  label: string;
  value: string | number;
  trend?: number;
  trendDirection?: 'up' | 'down' | 'stable';
  icon: string;
  color: string;
  bgLight: string;
}

// ==================== OPERATIONAL FEED ====================
export type FeedItemType = 'sale' | 'buyback' | 'repair' | 'stock-alert' | 'system';

export interface OperationalFeedItem {
  id: string;
  type: FeedItemType;
  title: string;
  description: string;
  storeBadge: string;
  status: 'pending' | 'in-progress' | 'completed' | 'alert';
  timestamp: string;
  actionUrl?: string;
}

// ==================== REPORTS ====================
export interface ReportMetrics {
  totalRevenue: number;
  totalExpenses: number;
  totalTransactions: number;
  totalBuybacks: number;
  totalRepairs: number;
  averageOrderValue: number;
  employeePerformance: EmployeeMetric[];
  storeComparison: StoreMetric[];
}

export interface EmployeeMetric {
  employeeId: string;
  employeeName: string;
  salesCount: number;
  revenue: number;
  avgOrderValue: number;
  performance: number;
}

export interface StoreMetric {
  storeId: string;
  storeName: string;
  revenue: number;
  transactions: number;
  buybacks: number;
  repairs: number;
  performance: number;
}

export interface ChartDataPoint {
  date: string;
  value: number;
  store?: string;
}

// ==================== NOTIFICATIONS ====================
export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  description?: string;
  timestamp: string;
  icon?: string;
  actionUrl?: string;
  isRead: boolean;
}

// ==================== SETTINGS ====================
export interface SystemSettings {
  storeName: string;
  currency: string;
  taxRate: number;
  businessHours: {
    open: string;
    close: string;
  };
  theme: 'light' | 'dark';
}
