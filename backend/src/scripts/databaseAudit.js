import mongoose from "mongoose";
import { connectDB } from "../db/mongodb.js";
import {
  BulkInventory,
  Buyback,
  Customer,
  Employee,
  EmployeeCredential,
  EmployeeStoreAssignment,
  PaymentEntry,
  Product,
  Role,
  Sale,
  SerializedInventory,
  StockLedger,
  Store,
  StoreInventory,
  User,
} from "../db/models.js";

const checks = [];
const FIXED_STORES = [
  { code: "STORE1", name: "Store 1" },
  { code: "STORE2", name: "Store 2" },
  { code: "STORE3", name: "Store 3" },
  { code: "STORE4", name: "Store 4" },
];

function addCheck(name, passed, detail = "") {
  checks.push({ name, passed, detail });
}

async function exists(Model, id) {
  if (!id) return false;
  return Boolean(await Model.exists({ _id: id }));
}

async function countDuplicateValues(Model, field) {
  const rows = await Model.aggregate([
    { $match: { [field]: { $nin: [null, ""] } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 },
  ]);
  return rows;
}

async function validateReferences() {
  const [users, employees, assignments, credentials, stores, sales, buybacks, payments, ledgerRows, inventories, bulkRows, serialRows] = await Promise.all([
    User.find().lean(),
    Employee.find().lean(),
    EmployeeStoreAssignment.find().lean(),
    EmployeeCredential.find().lean(),
    Store.find().lean(),
    Sale.find().lean(),
    Buyback.find().lean(),
    PaymentEntry.find().lean(),
    StockLedger.find().lean(),
    StoreInventory.find().lean(),
    BulkInventory.find().lean(),
    SerializedInventory.find().lean(),
  ]);

  const roleIds = new Set((await Role.find().select("_id").lean()).map((row) => row._id.toString()));
  const storeIds = new Set(stores.map((row) => row._id.toString()));
  const userIds = new Set(users.map((row) => row._id.toString()));
  const employeeIds = new Set(employees.map((row) => row._id.toString()));
  const productIds = new Set((await Product.find().select("_id").lean()).map((row) => row._id.toString()));
  const customerIds = new Set((await Customer.find().select("_id").lean()).map((row) => row._id.toString()));

  const badUserRoles = users.filter((user) => (user.roles || []).some((role) => !roleIds.has(role.toString())));
  addCheck("User roles reference existing Role records", badUserRoles.length === 0, `${badUserRoles.length} invalid user role references`);

  const badEmployees = employees.filter((employee) => !userIds.has(employee.user?.toString()) || !storeIds.has(employee.store?.toString()));
  addCheck("Employees reference valid users and stores", badEmployees.length === 0, `${badEmployees.length} invalid employee references`);

  const badAssignments = assignments.filter((row) => !employeeIds.has(row.employee?.toString()) || !storeIds.has(row.store?.toString()) || !userIds.has(row.assignedBy?.toString()));
  addCheck("Employee assignments reference valid employees/stores/users", badAssignments.length === 0, `${badAssignments.length} invalid assignment references`);

  const badCredentials = credentials.filter((row) => !employeeIds.has(row.employee?.toString()) || !userIds.has(row.user?.toString()));
  addCheck("Employee credentials reference valid employees/users", badCredentials.length === 0, `${badCredentials.length} invalid credential references`);

  const badSales = sales.filter((sale) => !storeIds.has(sale.store?.toString()) || !employeeIds.has(sale.employee?.toString()) || (sale.customer && !customerIds.has(sale.customer.toString())) || (sale.items || []).some((item) => !productIds.has(item.product?.toString())));
  addCheck("Sales reference valid store/employee/customer/products", badSales.length === 0, `${badSales.length} invalid sale references`);

  const badBuybacks = buybacks.filter((row) => (row.store && !storeIds.has(row.store.toString())) || (row.customer && !customerIds.has(row.customer.toString())) || (row.inventoryProduct && !productIds.has(row.inventoryProduct.toString())));
  addCheck("Buybacks reference valid store/customer/inventory product", badBuybacks.length === 0, `${badBuybacks.length} invalid buyback references`);


  const badPayments = payments.filter((row) => row.store && !storeIds.has(row.store.toString()));
  addCheck("Payments reference valid stores", badPayments.length === 0, `${badPayments.length} invalid payment store references`);

  const badLedgerRows = ledgerRows.filter((row) => !storeIds.has(row.store?.toString()) || !productIds.has(row.product?.toString()) || !userIds.has(row.createdBy?.toString()));
  addCheck("Stock ledger references valid store/product/user", badLedgerRows.length === 0, `${badLedgerRows.length} invalid ledger references`);

  const badLegacyInventory = inventories.filter((row) => !storeIds.has(row.store?.toString()) || (row.items || []).some((item) => !productIds.has(item.product?.toString()) || Number(item.quantity || 0) < 0));
  addCheck("Legacy store inventory references valid products and non-negative quantities", badLegacyInventory.length === 0, `${badLegacyInventory.length} invalid legacy inventory records`);

  const badBulkInventory = bulkRows.filter((row) => !storeIds.has(row.store?.toString()) || !productIds.has(row.product?.toString()) || Number(row.quantity || 0) < 0 || Number(row.reservedQuantity || 0) < 0);
  addCheck("Bulk inventory references valid products/stores and non-negative quantities", badBulkInventory.length === 0, `${badBulkInventory.length} invalid bulk inventory records`);

  const badSerializedInventory = serialRows.filter((row) => !storeIds.has(row.store?.toString()) || !productIds.has(row.product?.toString()));
  addCheck("Serialized inventory references valid products/stores", badSerializedInventory.length === 0, `${badSerializedInventory.length} invalid serialized inventory records`);
}

async function validateFixedStoreContract() {
  const stores = await Store.find().sort({ code: 1 }).lean();
  const activeStores = stores.filter((store) => store.isActive !== false);
  const fixedCodes = new Set(FIXED_STORES.map((store) => store.code));
  const activeFixedStores = activeStores.filter((store) => fixedCodes.has(store.code));
  const codeCounts = new Map();
  const nameCounts = new Map();

  stores.forEach((store) => {
    codeCounts.set(store.code, (codeCounts.get(store.code) || 0) + 1);
    nameCounts.set(store.name, (nameCounts.get(store.name) || 0) + 1);
  });

  addCheck("Store count is exactly 4 active fixed stores", activeStores.length === 4 && activeFixedStores.length === 4, `${activeStores.length} active stores, ${activeFixedStores.length} active fixed stores`);

  for (const expected of FIXED_STORES) {
    const matches = stores.filter((store) => store.code === expected.code);
    const store = matches[0];
    addCheck(`${expected.name} exists once with canonical code`, matches.length === 1, `${matches.length} records for ${expected.code}`);
    addCheck(`${expected.name} is visible and active`, Boolean(store && store.name === expected.name && store.isActive !== false), store ? `name=${store.name}, isActive=${store.isActive !== false}` : "missing");
  }

  const duplicateCodes = [...codeCounts.entries()].filter(([, count]) => count > 1);
  const duplicateNames = [...nameCounts.entries()].filter(([, count]) => count > 1);
  addCheck("Store codes are unique", duplicateCodes.length === 0, `${duplicateCodes.length} duplicate code groups`);
  addCheck("Store names are unique", duplicateNames.length === 0, `${duplicateNames.length} duplicate name groups`);
}

async function validateDuplicates() {
  const duplicateProductImei = await countDuplicateValues(Product, "imei");
  const duplicateProductBarcode = await countDuplicateValues(Product, "barcode");
  const duplicateSerializedImei = await countDuplicateValues(SerializedInventory, "imei");
  const duplicateSerializedBarcode = await countDuplicateValues(SerializedInventory, "barcode");
  const duplicateBuybackImei = await countDuplicateValues(Buyback, "imei");

  addCheck("Product IMEI values are unique", duplicateProductImei.length === 0, `${duplicateProductImei.length} duplicate IMEI groups`);
  addCheck("Product barcode values are unique", duplicateProductBarcode.length === 0, `${duplicateProductBarcode.length} duplicate barcode groups`);
  addCheck("Serialized inventory IMEI values are unique", duplicateSerializedImei.length === 0, `${duplicateSerializedImei.length} duplicate serialized IMEI groups`);
  addCheck("Serialized inventory barcode values are unique", duplicateSerializedBarcode.length === 0, `${duplicateSerializedBarcode.length} duplicate serialized barcode groups`);
  addCheck("Buyback IMEI values are unique", duplicateBuybackImei.length === 0, `${duplicateBuybackImei.length} duplicate buyback IMEI groups`);
}

async function validateIndexes() {
  const productIndexes = await Product.collection.indexes();
  const serializedIndexes = await SerializedInventory.collection.indexes();
  const bulkIndexes = await BulkInventory.collection.indexes();

  const hasIndex = (indexes, key) => indexes.some((index) => Object.keys(index.key).join(",") === key);
  addCheck("Product has searchable job/barcode/device indexes", hasIndex(productIndexes, "jobId,productCode,sku,barcode,imei,serialNumber,name,brand,model") || productIndexes.length > 1, `${productIndexes.length} product indexes`);
  addCheck("Serialized inventory has unique/search indexes", serializedIndexes.length >= 4, `${serializedIndexes.length} serialized inventory indexes`);
  addCheck("Bulk inventory has store/product index", bulkIndexes.some((index) => index.unique && index.key.store && index.key.product), `${bulkIndexes.length} bulk inventory indexes`);
}

async function main() {
  await connectDB();
  await validateFixedStoreContract();
  await validateReferences();
  await validateDuplicates();
  await validateIndexes();

  console.log("\n=== Database Integrity Audit ===");
  checks.forEach((check) => {
    console.log(`${check.passed ? "PASS" : "FAIL"} - ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
  });

  const failed = checks.filter((check) => !check.passed);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  await mongoose.disconnect();

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error("Database audit failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
