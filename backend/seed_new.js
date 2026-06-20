import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "./src/db/mongodb.js";
import {
  Role,
  User,
  AuthSession,
  Store,
  Employee,
  EmployeeStoreAssignment,
  EmployeeCredential,
  Customer,
  Product,
  StoreInventory,
  BulkInventory,
  SerializedInventory,
  StockLedger,
  Sale,
  Buyback,
  Expense,
  PaymentEntry,
  ChangeRequest,
  Notification,
  GiftTransaction,
  AuditLog,
  ExportLog,
  StoreManagerAssignment,
  SignupRequest,
  SequenceCounter,
} from "./src/db/models.js";

async function seed() {
  await connectDB();

  try {
    console.log("Cleaning up database...");
    await AuditLog.deleteMany({});
    await AuthSession.deleteMany({});
    await Buyback.deleteMany({});
    await BulkInventory.deleteMany({});
    await ChangeRequest.deleteMany({});
    await Customer.deleteMany({});
    await EmployeeCredential.deleteMany({});
    await Expense.deleteMany({});
    await ExportLog.deleteMany({});
    await GiftTransaction.deleteMany({});
    await Notification.deleteMany({});
    await PaymentEntry.deleteMany({});
    await Sale.deleteMany({});
    await SerializedInventory.deleteMany({});
    await StockLedger.deleteMany({});
    await StoreManagerAssignment.deleteMany({});
    await SignupRequest.deleteMany({});
    await SequenceCounter.deleteMany({});
    await StoreInventory.deleteMany({});
    await Role.deleteMany({});
    await User.deleteMany({});
    await Store.deleteMany({});
    await Employee.deleteMany({});
    await EmployeeStoreAssignment.deleteMany({});
    await Product.deleteMany({});

    console.log("Creating Roles...");
    const adminRole = await Role.create({
      name: "admin",
      description: "Full system access"
    });
    const managerRole = await Role.create({
      name: "manager",
      description: "Store management"
    });
    const cashierRole = await Role.create({
      name: "cashier",
      description: "Sales and POS operations"
    });

    console.log("Creating Admin User...");
    const passwordHash = await bcrypt.hash("admin123", 10);
    const adminUser = await User.create({
      username: "admin",
      email: "admin@qualitymobiles.com",
      fullName: "System Admin",
      passwordHash: passwordHash,
      isActive: true,
      roles: [adminRole._id]
    });

    console.log("Creating 4 fixed stores...");
    const stores = await Store.create([
      { code: "STORE1", name: "Store 1", isActive: true },
      { code: "STORE2", name: "Store 2", isActive: true },
      { code: "STORE3", name: "Store 3", isActive: true },
      { code: "STORE4", name: "Store 4", isActive: true }
    ]);
    const primaryStore = stores[0];

    console.log("Creating Employee...");
    const employee = await Employee.create({
      user: adminUser._id,
      store: primaryStore._id,
      fullName: "System Admin",
      phone: "1234567890",
      isActive: true,
      hiredAt: new Date()
    });
    await EmployeeStoreAssignment.create({
      employee: employee._id,
      store: primaryStore._id,
      role: "manager",
      assignedBy: adminUser._id,
      status: "active"
    });

    console.log("Creating Products...");
    const products = await Product.create([
      {
        sku: "iphone-15-pro-black",
        name: "iPhone 15 Pro",
        brand: "Apple",
        model: "15 Pro",
        variant: "128GB",
        color: "Black",
        condition: "new",
        category: "new_phone",
        purchasePrice: 900,
        unitPrice: 1099,
        isActive: true
      },
      {
        sku: "samsung-s24-ultra-titanium",
        name: "Samsung Galaxy S24 Ultra",
        brand: "Samsung",
        model: "S24 Ultra",
        variant: "256GB",
        color: "Titanium",
        condition: "new",
        category: "new_phone",
        purchasePrice: 1000,
        unitPrice: 1299,
        isActive: true
      },
      {
        sku: "airpods-pro-2",
        name: "AirPods Pro (2nd Gen)",
        brand: "Apple",
        model: "Pro 2",
        condition: "new",
        category: "accessory",
        purchasePrice: 180,
        unitPrice: 249,
        isActive: true
      }
    ]);

    console.log("Initializing Store Inventory...");
    await StoreInventory.create({
      store: primaryStore._id,
      items: products.map(p => ({
        product: p._id,
        quantity: 10,
        minStockLevel: 2
      }))
    });

    console.log("Seeding completed successfully!");
    console.log("Admin Login: admin / admin123");
  } catch (error) {
    console.error("Seeding failed:", error);
  } finally {
    await mongoose.disconnect();
  }
}

seed();
