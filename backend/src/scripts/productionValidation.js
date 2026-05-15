import mongoose from "mongoose";
import { connectDB } from "../db/mongodb.js";
import {
  Store,
  Customer,
  User,
  Role,
  Employee,
  Product,
  BulkInventory,
  SerializedInventory,
  StoreInventory,
  StockLedger,
  Sale,
  Buyback,
  Repair,
  PaymentEntry,
} from "../db/models.js";
import { HttpError } from "../utils/httpError.js";
import { createBuyback } from "../modules/buybacks/buybacks.service.js";
import { createPaymentEntry } from "../modules/payments/payments.service.js";
import { createProduct } from "../modules/products/products.service.js";
import { createRepair, updateRepair } from "../modules/repairs/repairs.service.js";
import { createSale, updateSale } from "../modules/sales/sales.service.js";

function addCheck(results, name, passed, detail) {
  results.push({ name, passed, detail });
}

function assertOrThrow(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function uniqueToken() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatError(error) {
  if (error instanceof HttpError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function getInventoryQuantity(storeId, productId) {
  const bulk = await BulkInventory.findOne({ store: storeId, product: productId });
  if (bulk) return Number(bulk.quantity || 0);
  const serializedCount = await SerializedInventory.countDocuments({
    store: storeId,
    product: productId,
    status: "in_stock",
  });
  if (serializedCount > 0) return serializedCount;
  const si = await StoreInventory.findOne({ store: storeId });
  if (!si) return 0;
  const item = si.items.find(
    (i) => i.product.toString() === productId.toString(),
  );
  return item ? item.quantity : 0;
}

async function createValidationStore(runToken, created) {
  const code = `VAL${runToken.slice(-6)}`;
  const name = `Validation Store ${runToken}`;
  const store = await Store.create({
    code,
    name,
    isActive: true,
  });

  created.storeIds.push(store._id);
  return store._id;
}

async function createValidationCustomer(runToken, storeId, created) {
  const customer = await Customer.create({
    store: storeId,
    fullName: `Validation Customer ${runToken}`,
    phone: `900${runToken.slice(-7)}`,
    email: `customer.${runToken}@validation.local`,
  });

  created.customerIds.push(customer._id);
  return customer._id;
}

async function createValidationUserEmployee(runToken, storeId, created) {
  let role = await Role.findOne({ name: "cashier" });
  if (!role) {
    role = await Role.create({ name: "cashier", description: "POS operator and sales execution" });
  }

  const user = await User.create({
    username: `validator_${runToken}`,
    email: `validator.${runToken}@validation.local`,
    passwordHash: `validation-password-hash-${runToken}`,
    isActive: true,
    roles: [role._id],
  });
  created.userIds.push(user._id);

  const employee = await Employee.create({
    user: user._id,
    store: storeId,
    fullName: `Validator Employee ${runToken}`,
    phone: `901${runToken.slice(-7)}`,
    commissionRate: 0,
    isActive: true,
  });

  created.employeeIds.push(employee._id);
  return user._id;
}

async function expectFailure(results, name, runner, validator) {
  try {
    await runner();
    addCheck(results, name, false, "Expected request to fail but it succeeded");
  } catch (error) {
    if (validator(error)) {
      addCheck(results, name, true);
    } else {
      addCheck(results, name, false, formatError(error));
    }
  }
}

async function cleanup(created) {
  if (created.productIds.length > 0 || created.storeIds.length > 0) {
    await StockLedger.deleteMany({
      $or: [
        { product: { $in: created.productIds } },
        { store: { $in: created.storeIds } },
      ],
    });
  }

  await PaymentEntry.deleteMany({ _id: { $in: created.paymentEntryIds } });

  if (created.buybackIds.length > 0) {
    await PaymentEntry.deleteMany({
      sourceType: "buyback",
      sourceId: { $in: created.buybackIds },
    });
  }

  await Sale.deleteMany({ _id: { $in: created.saleIds } });
  await Repair.deleteMany({ _id: { $in: created.repairIds } });
  await Buyback.deleteMany({ _id: { $in: created.buybackIds } });

  if (created.productIds.length > 0) {
    // Also remove these products from all store inventories
    await StoreInventory.updateMany(
      {},
      { $pull: { items: { product: { $in: created.productIds } } } },
    );
  }

  await Product.deleteMany({ _id: { $in: created.productIds } });
  await BulkInventory.deleteMany({ product: { $in: created.productIds } });
  await SerializedInventory.deleteMany({ product: { $in: created.productIds } });
  await Employee.deleteMany({ _id: { $in: created.employeeIds } });
  await User.deleteMany({ _id: { $in: created.userIds } });
  await Customer.deleteMany({ _id: { $in: created.customerIds } });
  await StoreInventory.deleteMany({ store: { $in: created.storeIds } });
  await Store.deleteMany({ _id: { $in: created.storeIds } });
}

async function run() {
  if (
    process.env.ALLOW_PROD_VALIDATION !== "true" &&
    process.env.NODE_ENV === "production"
  ) {
    console.error(
      "Refusing to run validation against production without ALLOW_PROD_VALIDATION=true",
    );
    return 1;
  }

  await connectDB();

  const results = [];
  const created = {
    storeIds: [],
    customerIds: [],
    userIds: [],
    employeeIds: [],
    productIds: [],
    buybackIds: [],
    repairIds: [],
    saleIds: [],
    paymentEntryIds: [],
  };

  const runToken = uniqueToken();

  try {
    const storeId = await createValidationStore(runToken, created);
    const customerId = await createValidationCustomer(
      runToken,
      storeId,
      created,
    );
    const userId = await createValidationUserEmployee(
      runToken,
      storeId,
      created,
    );

    const buyback = await createBuyback(
      {
        imei: `111111111${runToken.slice(-6)}`,
        brand: "Apple",
        model: "iPhone Validation",
        color: "Black",
        customer: customerId,
        storeRef: storeId,
        condition: "Good",
        marketValue: 500,
        negotiatedPrice: 420,
        cashAmount: 200,
        onlineAmount: 220,
        status: "Processed",
      },
      userId,
    );
    created.buybackIds.push(buyback.id);

    const buybackDoc = await Buyback.findById(buyback.id);
    const buybackProductId = buybackDoc?.inventoryProduct;

    assertOrThrow(
      Boolean(buybackProductId),
      "Processed buyback did not create inventory product",
    );

    if (buybackProductId) {
      created.productIds.push(buybackProductId);

      const postBuybackQty = await getInventoryQuantity(
        storeId,
        buybackProductId,
      );
      addCheck(
        results,
        "Flow 1: Buyback increases inventory",
        postBuybackQty === 1,
        `quantity=${postBuybackQty}`,
      );

      const buybackSale = await createSale({
        storeId,
        customerId,
        discountTotal: 0,
        exchangeTotal: 0,
        note: `Validation sale from buyback ${runToken}`,
        items: [{ productId: buybackProductId, quantity: 1 }],
        payments: [
          { paymentMethod: "cash", amount: toNumber(buyback.negotiated_price) },
        ],
        userId,
      });
      // createSale returns { sale: { _id, ... }, items, payments }
      created.saleIds.push(buybackSale.sale._id);

      addCheck(
        results,
        "Flow 1: Buyback item sale status paid",
        buybackSale.sale.paymentStatus === "paid",
        buybackSale.sale.paymentStatus,
      );

      const postSaleQty = await getInventoryQuantity(storeId, buybackProductId);
      addCheck(
        results,
        "Flow 1: Inventory decrements after sale",
        postSaleQty === 0,
        `quantity=${postSaleQty}`,
      );
    }

    const repair = await createRepair(
      {
        ticketNo: `R-${runToken}`,
        customerName: `Repair Customer ${runToken}`,
        customer: customerId,
        storeRef: storeId,
        deviceModel: "Samsung Test Device",
        technicianName: "Tech Validation",
        status: "Completed",
        partsCharge: 40,
        laborCost: 60,
        gotAmount: 20,
        inCash: 0,
        inOnline: 0,
        notes: "Repair validation",
      },
      userId,
    );
    created.repairIds.push(repair.id);

    addCheck(
      results,
      "Flow 2: Repair starts as partial payment",
      repair.payment_status === "partial",
      repair.payment_status,
    );

    const repairPaymentEntry = await createPaymentEntry(
      {
        storeRef: storeId,
        entryType: "in",
        dealerName: repair.customer_name,
        cashAmount: 80,
        onlineAmount: 0,
        paymentStatus: "paid",
        outstandingAmount: 0,
        entryDate: todayIso(),
        sourceType: "repair",
        sourceId: repair.id,
        notes: "Repair settlement",
      },
      userId,
    );
    created.paymentEntryIds.push(repairPaymentEntry.id);

    const closedRepair = await updateRepair(repair.id, {
      inCash: 80,
      status: "Delivered",
    });

    addCheck(
      results,
      "Flow 2: Repair closes as paid",
      closedRepair.payment_status === "paid",
      closedRepair.payment_status,
    );
    addCheck(
      results,
      "Flow 2: Repair can be delivered after payment",
      closedRepair.status === "Delivered",
      closedRepair.status,
    );

    const productA = await createProduct({
      sku: `VAL-A-${runToken}`,
      name: `Validation Product A ${runToken}`,
      category: "accessories",
      price: 30,
      stockQuantity: 10,
      primaryStoreRef: storeId,
      active: true,
    });
    const productB = await createProduct({
      sku: `VAL-B-${runToken}`,
      name: `Validation Product B ${runToken}`,
      category: "accessories",
      price: 20,
      stockQuantity: 10,
      primaryStoreRef: storeId,
      active: true,
    });

    created.productIds.push(productA.id, productB.id);

    const multiItemPartialSale = await createSale({
      storeId,
      customerId,
      discountTotal: 0,
      exchangeTotal: 0,
      note: "Validation partial multi-item sale",
      items: [
        { productId: productA.id, quantity: 2 },
        { productId: productB.id, quantity: 1 },
      ],
      payments: [{ paymentMethod: "cash", amount: 40 }],
      userId,
    });
    created.saleIds.push(multiItemPartialSale.sale._id);

    addCheck(
      results,
      "Flow 3: Multi-item sale supports partial payment",
      multiItemPartialSale.sale.paymentStatus === "partial",
      multiItemPartialSale.sale.paymentStatus,
    );

    const settledSale = await updateSale(multiItemPartialSale.sale._id, {
      cashAmount: 80,
      onlineAmount: 0,
      note: "Settlement",
      userId,
    });

    addCheck(
      results,
      "Flow 3: Partial sale can be settled to paid",
      settledSale.sale.paymentStatus === "paid",
      settledSale.sale.paymentStatus,
    );

    const fullSale = await createSale({
      storeId,
      customerId,
      discountTotal: 0,
      exchangeTotal: 0,
      note: "Validation full payment sale",
      items: [
        { productId: productA.id, quantity: 1 },
        { productId: productB.id, quantity: 1 },
      ],
      payments: [{ paymentMethod: "cash", amount: 50 }],
      userId,
    });
    created.saleIds.push(fullSale.sale._id);

    addCheck(
      results,
      "Flow 3: Full payment sale status",
      fullSale.sale.paymentStatus === "paid",
      fullSale.sale.paymentStatus,
    );

    const qtyA = await getInventoryQuantity(storeId, productA.id);
    const qtyB = await getInventoryQuantity(storeId, productB.id);
    addCheck(
      results,
      "Flow 3: Stock decrements product A",
      qtyA === 7,
      `quantity=${qtyA}`,
    );
    addCheck(
      results,
      "Flow 3: Stock decrements product B",
      qtyB === 8,
      `quantity=${qtyB}`,
    );

    await expectFailure(
      results,
      "Edge: Invalid product input rejected",
      async () => {
        await createProduct({
          sku: `VAL-NEG-${runToken}`,
          name: "Invalid Price Product",
          category: "new_phone",
          price: -1,
          stockQuantity: 0,
          primaryStoreRef: null,
          active: true,
        });
      },
      (error) =>
        error instanceof HttpError && error.code === "PRODUCT_INVALID_PRICE",
    );

    await expectFailure(
      results,
      "Edge: Duplicate SKU rejected",
      async () => {
        await createProduct({
          sku: productA.sku,
          name: "Duplicate SKU",
          category: "new_phone",
          price: 100,
          stockQuantity: 0,
          primaryStoreRef: null,
          active: true,
        });
      },
      (error) =>
        error instanceof HttpError && error.code === "PRODUCT_DUPLICATE_SKU",
    );

    await expectFailure(
      results,
      "Edge: Duplicate IMEI rejected",
      async () => {
        const duplicateImei = `111111111${runToken.slice(-6)}`;
        await createBuyback(
          {
            imei: duplicateImei,
            brand: "Apple",
            model: "Duplicate",
            color: "Gray",
            customer: customerId,
            storeRef: storeId,
            condition: "Good",
            marketValue: 300,
            negotiatedPrice: 250,
            status: "Pending",
          },
          userId,
        );
      },
      (error) =>
        error instanceof HttpError && error.code === "BUYBACK_DUPLICATE_IMEI",
    );

    const concurrentProduct = await createProduct({
      sku: `VAL-CON-${runToken}`,
      name: `Concurrent Product ${runToken}`,
      category: "accessories",
      price: 90,
      stockQuantity: 1,
      primaryStoreRef: storeId,
      active: true,
    });
    created.productIds.push(concurrentProduct.id);

    const concurrentSalePayload = {
      storeId,
      customerId,
      discountTotal: 0,
      exchangeTotal: 0,
      note: "Concurrent stock validation",
      items: [{ productId: concurrentProduct.id, quantity: 1 }],
      payments: [{ paymentMethod: "cash", amount: 90 }],
      userId,
    };

    const concurrentResults = await Promise.allSettled([
      createSale(concurrentSalePayload),
      createSale(concurrentSalePayload),
    ]);

    const successCount = concurrentResults.filter(
      (entry) => entry.status === "fulfilled",
    ).length;
    const failureCount = concurrentResults.filter(
      (entry) => entry.status === "rejected",
    ).length;

    concurrentResults.forEach((entry) => {
      if (entry.status === "fulfilled") {
        created.saleIds.push(entry.value.sale._id);
      }
    });

    addCheck(
      results,
      "Edge: Concurrent sales do not oversell stock",
      successCount === 1 && failureCount === 1,
      `success=${successCount}, failure=${failureCount}`,
    );
  } catch (error) {
    addCheck(results, "Validation run execution", false, formatError(error));
  } finally {
    try {
      await cleanup(created);
    } catch (error) {
      addCheck(results, "Cleanup", false, formatError(error));
    }

    await mongoose.disconnect();
  }

  console.log("\n=== Production Validation Results ===");
  for (const result of results) {
    console.log(
      `${result.passed ? "PASS" : "FAIL"} | ${result.name}${result.detail ? ` | ${result.detail}` : ""}`,
    );
  }

  const failed = results.filter((entry) => !entry.passed);
  console.log(
    `\nSummary: ${results.length - failed.length}/${results.length} checks passed`,
  );

  return failed.length > 0 ? 1 : 0;
}

run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error("Validation script failed unexpectedly", formatError(error));
    process.exitCode = 1;
  });
