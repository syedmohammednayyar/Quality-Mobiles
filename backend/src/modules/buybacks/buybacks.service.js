import mongoose from "mongoose";
import { Buyback, Store, Customer, Product, SerializedInventory, StoreInventory, StockLedger, PaymentEntry } from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";
import { generateJobNumber } from "../../utils/jobNumber.js";

function toMoney(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, "Invalid money value", "BUYBACK_INVALID_AMOUNT");
  }
  return parsed.toFixed(2);
}

function toDbCondition(condition) {
  return condition.toLowerCase();
}

function toDbStatus(status) {
  return status.toLowerCase();
}

function toApiCondition(condition) {
  if (condition === "excellent") return "Excellent";
  if (condition === "good") return "Good";
  if (condition === "fair") return "Fair";
  return "Poor";
}

function toApiStatus(status) {
  if (status === "accepted") return "Accepted";
  if (status === "processed") return "Processed";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function mapBuyback(doc) {
  return {
    id: doc._id.toString(),
    imei: doc.imei,
    brand: doc.brand,
    model: doc.model,
    color: doc.color || "",
    storage: doc.storageVariant || "",
    serial_number: doc.serialNumber || "",
    battery_health: doc.batteryHealth || 0,
    accessories_received: doc.accessoriesReceived || [],
    box_available: !!doc.boxAvailable,
    charger_available: !!doc.chargerAvailable,
    physical_inspection: doc.physicalInspection || {},
    functional_inspection: doc.functionalInspection || {},
    damage_detection: doc.damageDetection || {},
    condition_deduction: toMoney(doc.conditionDeduction),
    final_valuation: toMoney(doc.finalValuation),
    suggested_resale_price: toMoney(doc.suggestedResalePrice),
    exchange_credit_amount: toMoney(doc.exchangeCreditAmount),
    rack_location: doc.rackLocation || "",
    notes: doc.notes || "",
    inspection_notes: doc.inspectionNotes || "",
    pricing_notes: doc.pricingNotes || "",
    resale_notes: doc.resaleNotes || "",
    transfer_history: doc.transferHistory || [],
    customer: doc.customer ? doc.customer.toString() : null,
    store_ref: doc.store ? doc.store.toString() : null,
    destination_store_ref: doc.destinationStore ? doc.destinationStore.toString() : null,
    job_no: doc.jobNo || "",
    transaction_type: doc.transactionType || "direct",
    customer_name: doc.customerName || "",
    dealer_name: doc.dealerName || "",
    customer_contact_number: doc.customerContactNumber || "",
    dealer_contact_number: doc.dealerContactNumber || "",
    ic_number: doc.icNumber || "",
    cash_amount: toMoney(doc.cashAmount),
    online_amount: toMoney(doc.onlineAmount),
    exchange_amount: toMoney(doc.exchangeAmount),
    exchange_model: doc.exchangeModel || "",
    condition: toApiCondition(doc.condition),
    condition_assessed: !!doc.conditionAssessed,
    market_value: toMoney(doc.marketValue),
    negotiated_price: toMoney(doc.negotiatedPrice),
    repair_cost: toMoney(doc.repairCost),
    other_capitalized_cost: toMoney(doc.otherCapitalizedCost),
    total_cost_basis: toMoney(Number(doc.negotiatedPrice || 0) + Number(doc.repairCost || 0) + Number(doc.otherCapitalizedCost || 0)),
    inventory_status: doc.inventoryStatus || "ready",
    linked_sale_id: doc.linkedSale ? doc.linkedSale.toString() : null,
    linked_sale_no: doc.linkedSaleNo || "",
    linked_product_ids: (doc.linkedProductIds || []).map((value) => value.toString()),
    status: toApiStatus(doc.status),
    created_at: doc.createdAt,
  };
}

async function requireStore(storeId) {
  const store = await Store.findOne({ _id: new mongoose.Types.ObjectId(storeId), isActive: { $ne: false } });
  if (!store) {
    throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
  }
}

async function requireCustomer(customerId) {
  const customer = await Customer.findById(new mongoose.Types.ObjectId(customerId));
  if (!customer) {
    throw new HttpError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  }
}

async function processBuybackIntoInventory(buyback, userId, session) {
  const storeId = buyback.destinationStore || buyback.store;
  if (!storeId) {
    throw new HttpError(
      400,
      "Store is required before processing buyback",
      "BUYBACK_STORE_REQUIRED",
    );
  }

  // Declared up-front: the new-product branch below references these, and
  // reading a `const` before its declaration is a TDZ ReferenceError.
  const storeObjectId = new mongoose.Types.ObjectId(storeId);
  const storeDoc = await Store.findById(storeObjectId).session(session);
  // "ready" is the only other valid Product.inventoryStatus for a device that
  // is physically in stock; anything else is treated as sellable.
  const nextInventoryStatus = buyback.inventoryStatus === "under_repair" ? "under_repair" : "ready";

  let productId = buyback.inventoryProduct;

  if (!productId) {
    const existingProduct = await Product.findOne({ imei: buyback.imei }).session(session);

    if (existingProduct) {
      productId = existingProduct._id;
    } else {
      const sku = `USED-${buyback._id.toString().slice(-6).toUpperCase()}`;
      const name = `${buyback.brand} ${buyback.model}`.trim();

      // A bought-back device becomes a normal inventory record, so it draws
      // from the same global Job Number sequence as everything else instead of
      // minting a parallel JOB-BB- identifier of its own.
      const jobId = await generateJobNumber();
      const [newProduct] = await Product.create([{
        sku,
        jobId,
        imei: buyback.imei || undefined,
        name,
        brand: buyback.brand,
        model: buyback.model,
        color: buyback.color || "",
        storage: buyback.storageVariant || "",
        condition: "used",
        category: 'used_phone',
        purchasePrice: Number(toMoney(buyback.negotiatedPrice)),
        unitPrice: Number(toMoney(buyback.finalValuation || buyback.negotiatedPrice || buyback.suggestedResalePrice)),
        inventoryStatus: nextInventoryStatus,
        inventoryMode: "serialized",
        taxRate: 0,
        isActive: true,
        store: storeObjectId,
        storeName: storeDoc?.name || "",
      }], { session });

      productId = newProduct._id;
    }

    buyback.inventoryProduct = productId;
    await buyback.save({ session });
  }

  const productObjectId = new mongoose.Types.ObjectId(productId);

  // Keep the linked Product in sync on every pass — this is what POS reads to
  // decide whether the device is sellable, so a device reused from an existing
  // product record still picks up the correct Ready/Under Repair state.
  await Product.updateOne(
    { _id: productObjectId },
    { $set: { inventoryStatus: nextInventoryStatus, updatedAt: new Date() } },
    { session },
  );

  // The serialized unit has to carry the same Job Number as the product record
  // it belongs to — Reports and the POS job lookup match on this field, and a
  // device reused from an existing product keeps that product's number.
  const inventoryProduct = await Product.findById(productObjectId).select("jobId").session(session).lean();

  await SerializedInventory.findOneAndUpdate(
    { product: productObjectId, ...(buyback.imei ? { imei: buyback.imei } : {}) },
    { $set: { serialId: `BB-${buyback._id}`, jobNumber: inventoryProduct?.jobId || undefined, store: storeObjectId, status: buyback.inventoryStatus === "under_repair" ? "under_repair" : "in_stock", addedBy: userId, notes: "BUYBACK / USED PHONE" } },
    { upsert: true, session },
  );

  const res = await StoreInventory.findOneAndUpdate(
    { store: storeObjectId, "items.product": productObjectId },
    { 
      $inc: { "items.$.quantity": 1 },
      $set: { updatedAt: new Date() }
    },
    { session, returnDocument: "after" }
  );

  if (!res) {
    await StoreInventory.findOneAndUpdate(
      { store: storeObjectId },
      { 
        $push: { 
          items: { 
            product: productObjectId, 
            quantity: 1, 
            reservedQuantity: 0, 
            minStockLevel: 0 
          } 
        },
        $set: { updatedAt: new Date() }
      },
      { upsert: true, session }
    );
  }

  await StockLedger.create([{
    store: storeObjectId,
    product: productObjectId,
    movementType: 'in',
    quantity: 1,
    referenceType: 'buyback',
    referenceId: buyback._id,
    note: `Buyback processed for ${buyback.imei || buyback.serialNumber || buyback.model}`,
    createdBy: userId,
  }], { session });

  const cash = Number(buyback.cashAmount || 0);
  const online = Number(buyback.onlineAmount || 0);

  if (cash > 0 || online > 0) {
    const existingPaymentEntry = await PaymentEntry.findOne({
      sourceType: 'buyback',
      sourceId: buyback._id
    }).session(session);

    if (!existingPaymentEntry) {
      await PaymentEntry.create([{
        store: storeObjectId,
        entryType: 'out',
        dealerName: `Buyback ${buyback.imei}`,
        cashAmount: Number(toMoney(cash)),
        onlineAmount: Number(toMoney(online)),
        paymentStatus: 'paid',
        outstandingAmount: 0,
        entryDate: new Date(),
        sourceType: 'buyback',
        sourceId: buyback._id,
        notes: `Payout for processed buyback ${buyback.imei}`,
        createdBy: userId,
      }], { session });
    }
  }
}

// Status-only sync for a buyback whose inventory record already exists.
// Deliberately separate from processBuybackIntoInventory, which also
// increments StoreInventory quantity — re-running that on an edit would
// double-count the device.
async function syncBuybackInventoryStatus(buyback, session) {
  if (!buyback.inventoryProduct) return;
  const nextInventoryStatus = buyback.inventoryStatus === "under_repair" ? "under_repair" : "ready";
  const productObjectId = new mongoose.Types.ObjectId(buyback.inventoryProduct);

  // Never override a device that has already been sold — the same rule the
  // SerializedInventory update below has always applied, which Product was
  // missing. Rewriting a sold product's status here left the device recorded as
  // sold on the sales side and sellable on the product side, and a later
  // retrieval then had no "sold" status left to recognise, so the sale kept
  // counting towards revenue after the device came back.
  await Product.updateOne(
    { _id: productObjectId, inventoryStatus: { $ne: "sold" } },
    { $set: { inventoryStatus: nextInventoryStatus, updatedAt: new Date() } },
    { session },
  );

  // Never override a device that has already been sold/transferred out.
  await SerializedInventory.updateMany(
    { product: productObjectId, status: { $in: ["in_stock", "under_repair", "buyback_hold"] } },
    { $set: { status: nextInventoryStatus === "under_repair" ? "under_repair" : "in_stock", updatedAt: new Date() } },
    { session },
  );
}

export async function listBuybacks(input = {}) {
  const query = input.storeId ? { store: input.storeId } : {};
  const buybacks = await Buyback.find(query).sort({ createdAt: -1 });
  return buybacks.map(mapBuyback);
}

export async function createBuyback(input, userId) {
  return withTransaction(async (session) => {
    const imei = (input.imei || "").trim();
    const serialNumber = (input.serial_number || "").trim();
    if (!imei && !serialNumber) {
      throw new HttpError(400, "IMEI or serial number is required", "BUYBACK_INVALID_IMEI");
    }
    if (imei && !/^\d{15}$/.test(imei)) {
      throw new HttpError(400, "IMEI must contain exactly 15 digits", "BUYBACK_INVALID_IMEI");
    }

    const brand = input.brand.trim();
    const model = input.model.trim();
    if (!brand || !model) {
      throw new HttpError(
        400,
        "Brand and model are required",
        "BUYBACK_REQUIRED_DEVICE_FIELDS",
      );
    }

    if (input.storeRef) {
      await requireStore(input.storeRef);
    }

    if (input.customer) {
      await requireCustomer(input.customer);
    }

    const existingBuyback = await Buyback.findOne({ $or: [{ imei }, ...(serialNumber ? [{ serialNumber }] : [])] }).session(session);
    if (existingBuyback) {
      throw new HttpError(
        409,
        "IMEI already exists in buybacks",
        "BUYBACK_DUPLICATE_IMEI",
      );
    }

    const [buyback] = await Buyback.create([{
      transactionType: input.transactionType || "direct",
      imei,
      serialNumber: serialNumber || null,
      brand,
      model,
      color: (input.color || "").trim() || null,
      customer: input.customer ? new mongoose.Types.ObjectId(input.customer) : null,
      store: input.storeRef ? new mongoose.Types.ObjectId(input.storeRef) : null,
      destinationStore: input.destinationStoreRef ? new mongoose.Types.ObjectId(input.destinationStoreRef) : (input.storeRef ? new mongoose.Types.ObjectId(input.storeRef) : null),
      jobNo: (input.jobNo || "").trim() || null,
      customerName: (input.customerName || "").trim() || null,
      dealerName: (input.dealerName || "").trim() || null,
      customerContactNumber: (input.customerContactNumber || "").trim() || null,
      dealerContactNumber: (input.dealerContactNumber || "").trim() || null,
      ramVariant: (input.ramVariant || input.ram || "").trim() || null,
      storageVariant: (input.storageVariant || input.storage || "").trim() || null,
      serialNumber: (input.serial_number || "").trim() || null,
      batteryHealth: Number(input.battery_health || 0),
      accessoriesReceived: input.accessories_received || [],
      boxAvailable: !!input.box_available,
      chargerAvailable: !!input.charger_available,
      physicalInspection: input.physical_inspection || {},
      functionalInspection: input.functional_inspection || {},
      damageDetection: input.damage_detection || {},
      conditionDeduction: Number(toMoney(input.condition_deduction)),
      finalValuation: Number(toMoney(input.final_valuation || input.negotiatedPrice)),
      suggestedResalePrice: Number(toMoney(input.suggested_resale_price || input.marketValue)),
      exchangeCreditAmount: Number(toMoney(input.exchange_credit_amount)),
      rackLocation: (input.rack_location || "").trim() || null,
      inspectionNotes: (input.inspection_notes || "").trim() || null,
      pricingNotes: (input.pricing_notes || "").trim() || null,
      resaleNotes: (input.resale_notes || "").trim() || null,
      icNumber: (input.icNumber || "").trim() || null,
      cashAmount: Number(toMoney(input.cashAmount)),
      onlineAmount: Number(toMoney(input.onlineAmount)),
      exchangeAmount: Number(toMoney(input.exchangeAmount)),
      exchangeModel: (input.exchangeModel || "").trim() || null,
      condition: toDbCondition(input.condition),
      conditionAssessed: !!input.conditionAssessed,
      payoutMethod: input.payoutMethod || null,
      serviceReadyStatus: input.serviceReadyStatus || null,
      marketValue: Number(toMoney(input.marketValue)),
      negotiatedPrice: Number(toMoney(input.negotiatedPrice)),
      repairCost: Number(toMoney(input.repairCost || input.repair_cost || 0)),
      otherCapitalizedCost: Number(toMoney(input.otherCapitalizedCost || input.other_capitalized_cost || 0)),
      status: toDbStatus(input.status || "Pending"),
      inventoryStatus: input.inventoryStatus || "ready",
      linkedSale: input.linkedSale ? new mongoose.Types.ObjectId(input.linkedSale) : null,
      linkedSaleNo: input.linkedSaleNo || null,
      linkedProductIds: (input.linkedProductIds || []).map((value) => new mongoose.Types.ObjectId(value)),
      createdBy: userId,
    }], { session });

    await processBuybackIntoInventory(buyback, userId, session);

    return mapBuyback(buyback);
  });
}

export async function updateBuyback(buybackId, input, userId) {
  return withTransaction(async (session) => {
    const buyback = await Buyback.findById(new mongoose.Types.ObjectId(buybackId)).session(session);
    if (!buyback) {
      throw new HttpError(404, "Buyback not found", "BUYBACK_NOT_FOUND");
    }

    const nextStatus = input.status ? toDbStatus(input.status) : buyback.status;

    const nextStoreId = input.storeRef !== undefined ? (input.storeRef ? new mongoose.Types.ObjectId(input.storeRef) : null) : buyback.store;
    const nextCustomerId = input.customer !== undefined ? (input.customer ? new mongoose.Types.ObjectId(input.customer) : null) : buyback.customer;

    if (nextStoreId) {
      await requireStore(nextStoreId);
    }

    if (nextCustomerId) {
      await requireCustomer(nextCustomerId);
    }

    const nextImei = input.imei !== undefined ? (input.imei || "").trim() : buyback.imei;
    const nextSerial = input.serial_number !== undefined ? (input.serial_number || "").trim() : buyback.serialNumber;
    if (!nextImei && !nextSerial) {
      throw new HttpError(400, "IMEI or serial number is required", "BUYBACK_INVALID_IMEI");
    }
    if (nextImei && !/^\d{15}$/.test(nextImei)) {
      throw new HttpError(400, "IMEI must contain exactly 15 digits", "BUYBACK_INVALID_IMEI");
    }

    const nextBrand = input.brand !== undefined ? input.brand.trim() : buyback.brand;
    const nextModel = input.model !== undefined ? input.model.trim() : buyback.model;
    if (!nextBrand || !nextModel) {
      throw new HttpError(
        400,
        "Brand and model are required",
        "BUYBACK_REQUIRED_DEVICE_FIELDS",
      );
    }

    const oldStatus = buyback.status;

    buyback.imei = nextImei;
    buyback.serialNumber = nextSerial || null;
    buyback.brand = nextBrand;
    buyback.model = nextModel;
    buyback.color = input.color !== undefined ? (input.color || "").trim() || null : buyback.color;
    buyback.customer = nextCustomerId;
    buyback.store = nextStoreId;
    buyback.destinationStore = input.destinationStoreRef !== undefined ? (input.destinationStoreRef ? new mongoose.Types.ObjectId(input.destinationStoreRef) : null) : buyback.destinationStore;
    buyback.jobNo = input.jobNo !== undefined ? (input.jobNo || "").trim() || null : buyback.jobNo;
    buyback.customerName = input.customerName !== undefined ? (input.customerName || "").trim() || null : buyback.customerName;
    buyback.dealerName = input.dealerName !== undefined ? (input.dealerName || "").trim() || null : buyback.dealerName;
    buyback.customerContactNumber = input.customerContactNumber !== undefined ? (input.customerContactNumber || "").trim() || null : buyback.customerContactNumber;
    buyback.dealerContactNumber = input.dealerContactNumber !== undefined ? (input.dealerContactNumber || "").trim() || null : buyback.dealerContactNumber;
    buyback.ramVariant = input.ramVariant !== undefined ? (input.ramVariant || input.ram || "").trim() || null : buyback.ramVariant;
    buyback.storageVariant = input.storageVariant !== undefined ? (input.storageVariant || input.storage || "").trim() || null : buyback.storageVariant;
    if (input.serial_number !== undefined) buyback.serialNumber = input.serial_number;
    if (input.battery_health !== undefined) buyback.batteryHealth = input.battery_health;
    if (input.accessories_received !== undefined) buyback.accessoriesReceived = input.accessories_received;
    if (input.box_available !== undefined) buyback.boxAvailable = input.box_available;
    if (input.charger_available !== undefined) buyback.chargerAvailable = input.charger_available;
    if (input.physical_inspection !== undefined) buyback.physicalInspection = input.physical_inspection;
    if (input.functional_inspection !== undefined) buyback.functionalInspection = input.functional_inspection;
    if (input.damage_detection !== undefined) buyback.damageDetection = input.damage_detection;
    if (input.condition_deduction !== undefined) buyback.conditionDeduction = Number(toMoney(input.condition_deduction));
    if (input.final_valuation !== undefined) buyback.finalValuation = Number(toMoney(input.final_valuation));
    if (input.suggested_resale_price !== undefined) buyback.suggestedResalePrice = Number(toMoney(input.suggested_resale_price));
    if (input.exchange_credit_amount !== undefined) buyback.exchangeCreditAmount = Number(toMoney(input.exchange_credit_amount));
    if (input.rack_location !== undefined) buyback.rackLocation = input.rack_location;
    if (input.notes !== undefined) buyback.notes = input.notes;
    if (input.inspection_notes !== undefined) buyback.inspectionNotes = input.inspection_notes;
    if (input.pricing_notes !== undefined) buyback.pricingNotes = input.pricing_notes;
    if (input.resale_notes !== undefined) buyback.resaleNotes = input.resale_notes;
    buyback.icNumber = input.icNumber !== undefined ? (input.icNumber || "").trim() || null : buyback.icNumber;
    buyback.cashAmount = input.cashAmount !== undefined ? Number(toMoney(input.cashAmount)) : buyback.cashAmount;
    buyback.onlineAmount = input.onlineAmount !== undefined ? Number(toMoney(input.onlineAmount)) : buyback.onlineAmount;
    buyback.exchangeAmount = input.exchangeAmount !== undefined ? Number(toMoney(input.exchangeAmount)) : buyback.exchangeAmount;
    buyback.exchangeModel = input.exchangeModel !== undefined ? (input.exchangeModel || "").trim() || null : buyback.exchangeModel;
    buyback.conditionAssessed = input.conditionAssessed !== undefined ? !!input.conditionAssessed : buyback.conditionAssessed;
    buyback.payoutMethod = input.payoutMethod !== undefined ? input.payoutMethod : buyback.payoutMethod;
    buyback.serviceReadyStatus = input.serviceReadyStatus !== undefined ? input.serviceReadyStatus : buyback.serviceReadyStatus;
    buyback.condition = input.condition !== undefined ? toDbCondition(input.condition) : buyback.condition;
    buyback.marketValue = input.marketValue !== undefined ? Number(toMoney(input.marketValue)) : buyback.marketValue;
    buyback.negotiatedPrice = input.negotiatedPrice !== undefined ? Number(toMoney(input.negotiatedPrice)) : buyback.negotiatedPrice;
    const repairCostInput = input.repairCost !== undefined ? input.repairCost : input.repair_cost;
    const otherCostInput = input.otherCapitalizedCost !== undefined ? input.otherCapitalizedCost : input.other_capitalized_cost;
    const costBasisChanged = repairCostInput !== undefined || otherCostInput !== undefined || input.negotiatedPrice !== undefined;
    if (repairCostInput !== undefined) buyback.repairCost = Number(toMoney(repairCostInput));
    if (otherCostInput !== undefined) buyback.otherCapitalizedCost = Number(toMoney(otherCostInput));
    buyback.inventoryStatus = input.inventoryStatus !== undefined ? input.inventoryStatus : buyback.inventoryStatus;
    buyback.transactionType = input.transactionType !== undefined ? input.transactionType : buyback.transactionType;
    buyback.linkedSale = input.linkedSale !== undefined ? (input.linkedSale ? new mongoose.Types.ObjectId(input.linkedSale) : null) : buyback.linkedSale;
    buyback.linkedSaleNo = input.linkedSaleNo !== undefined ? (input.linkedSaleNo || "").trim() || null : buyback.linkedSaleNo;
    buyback.linkedProductIds = input.linkedProductIds !== undefined ? (input.linkedProductIds || []).map((value) => new mongoose.Types.ObjectId(value)) : buyback.linkedProductIds;
    buyback.status = nextStatus;

    await buyback.save({ session });

    if (!buyback.inventoryProduct) {
      await processBuybackIntoInventory(buyback, userId, session);
    } else if (input.inventoryStatus !== undefined) {
      // Ready for Sale <-> Under Repair transition on an existing device:
      // push it through to the Product/SerializedInventory records that POS
      // reads, without touching stock quantities.
      await syncBuybackInventoryStatus(buyback, session);
    }

    // Loss Management: keep the linked Product's cost basis in sync with the buyback's
    // total cost (negotiatedPrice + repair + other capitalized cost) so *future* sales
    // snapshot the correct cost basis. Historical sales already snapshotted their own
    // costBasis at sale time and are never touched by this.
    if (costBasisChanged && buyback.inventoryProduct) {
      const totalCostBasis = Number(buyback.negotiatedPrice || 0) + Number(buyback.repairCost || 0) + Number(buyback.otherCapitalizedCost || 0);
      await Product.updateOne(
        { _id: buyback.inventoryProduct },
        { $set: { purchasePrice: Number(totalCostBasis.toFixed(2)), updatedAt: new Date() } },
        { session },
      );
    }

    return mapBuyback(buyback);
  });
}

export async function deleteBuyback(buybackId) {
  return withTransaction(async (session) => {
    const buyback = await Buyback.findById(new mongoose.Types.ObjectId(buybackId)).session(session);
    if (!buyback) {
      throw new HttpError(404, "Buyback not found", "BUYBACK_NOT_FOUND");
    }

    if (buyback.status === "processed") {
      throw new HttpError(
        409,
        "Processed buybacks cannot be deleted",
        "BUYBACK_DELETE_FORBIDDEN",
      );
    }

    await Buyback.deleteOne({ _id: new mongoose.Types.ObjectId(buybackId) }).session(session);
  });
}
