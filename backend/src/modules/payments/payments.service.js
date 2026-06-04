import { PaymentEntry, Store, Sale, Customer } from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";

function toMoney(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, "Invalid money value", "PAYMENT_INVALID_AMOUNT");
  }
  return parsed.toFixed(2);
}

function mapPaymentEntry(doc) {
  return {
    id: doc._id.toString(),
    store_ref: doc.store ? doc.store.toString() : null,
    entry_type: doc.entryType,
    dealer_name: doc.dealerName,
    cash_amount: toMoney(doc.cashAmount),
    online_amount: toMoney(doc.onlineAmount),
    payment_status: doc.paymentStatus,
    outstanding_amount: toMoney(doc.outstandingAmount),
    entry_date: doc.entryDate ? doc.entryDate.toISOString().split('T')[0] : "",
    notes: doc.notes || "",
    source_type: doc.sourceType,
    source_id: doc.sourceId ? doc.sourceId.toString() : null,
    created_at: doc.createdAt,
  };
}

function resolvePaymentStatus(input) {
  if (input.explicitStatus) {
    return input.explicitStatus;
  }

  const settled = input.cashAmount + input.onlineAmount;
  if (input.outstandingAmount <= 0) {
    return "paid";
  }

  if (settled > 0) {
    return "partial";
  }

  return "pending";
}

async function requireStore(storeId) {
  const store = await Store.findOne({ _id: storeId, isActive: { $ne: false } });
  if (!store) {
    throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
  }
}

export async function listPaymentEntries(input = {}) {
  const query = input.storeId ? { store: input.storeId } : {};
  const entries = await PaymentEntry.find(query).sort({ entryDate: -1, createdAt: -1 });
  return entries.map(mapPaymentEntry);
}

export async function createPaymentEntry(input, userId) {
  return withTransaction(async (session) => {
    const dealerName = input.dealerName.trim();
    if (!dealerName) {
      throw new HttpError(
        400,
        "Dealer name is required",
        "PAYMENT_REQUIRED_DEALER_NAME",
      );
    }

    if (input.storeRef) {
      await requireStore(input.storeRef);
    }

    const cashAmount = Number(toMoney(input.cashAmount));
    const onlineAmount = Number(toMoney(input.onlineAmount));
    const outstandingAmount = Number(toMoney(input.outstandingAmount));

    if (cashAmount + onlineAmount <= 0 && outstandingAmount <= 0) {
      throw new HttpError(
        400,
        "Amount must be greater than zero",
        "PAYMENT_REQUIRED_AMOUNT",
      );
    }

    const paymentStatus = resolvePaymentStatus({
      cashAmount,
      onlineAmount,
      outstandingAmount,
      explicitStatus: input.paymentStatus,
    });

    const [entry] = await PaymentEntry.create([{
      store: input.storeRef || null,
      entryType: input.entryType,
      dealerName,
      cashAmount,
      onlineAmount,
      paymentStatus,
      outstandingAmount,
      entryDate: new Date(input.entryDate),
      sourceType: input.sourceType || "manual",
      sourceId: input.sourceId || null,
      notes: (input.notes || "").trim() || null,
      createdBy: userId,
    }], { session });

    return mapPaymentEntry(entry);
  });
}

export async function updatePaymentEntry(paymentEntryId, input) {
  return withTransaction(async (session) => {
    const entry = await PaymentEntry.findById(paymentEntryId).session(session);
    if (!entry) {
      throw new HttpError(404, "Payment entry not found", "PAYMENT_ENTRY_NOT_FOUND");
    }

    const nextStoreRef = input.storeRef !== undefined ? input.storeRef : entry.store;
    if (nextStoreRef) {
      await requireStore(nextStoreRef);
    }

    const dealerName = input.dealerName !== undefined ? input.dealerName.trim() : entry.dealerName;
    if (!dealerName) {
      throw new HttpError(
        400,
        "Dealer name is required",
        "PAYMENT_REQUIRED_DEALER_NAME",
      );
    }

    const cashAmount = Number(input.cashAmount !== undefined ? toMoney(input.cashAmount) : toMoney(entry.cashAmount));
    const onlineAmount = Number(input.onlineAmount !== undefined ? toMoney(input.onlineAmount) : toMoney(entry.onlineAmount));
    const outstandingAmount = Number(input.outstandingAmount !== undefined ? toMoney(input.outstandingAmount) : toMoney(entry.outstandingAmount));

    if (cashAmount + onlineAmount <= 0 && outstandingAmount <= 0) {
      throw new HttpError(
        400,
        "Amount must be greater than zero",
        "PAYMENT_REQUIRED_AMOUNT",
      );
    }

    const paymentStatus = resolvePaymentStatus({
      cashAmount,
      onlineAmount,
      outstandingAmount,
      explicitStatus: input.paymentStatus,
    });

    entry.store = nextStoreRef;
    if (input.entryType !== undefined) entry.entryType = input.entryType;
    entry.dealerName = dealerName;
    entry.cashAmount = cashAmount;
    entry.onlineAmount = onlineAmount;
    entry.paymentStatus = paymentStatus;
    entry.outstandingAmount = outstandingAmount;
    if (input.entryDate !== undefined) entry.entryDate = new Date(input.entryDate);
    if (input.sourceType !== undefined) entry.sourceType = input.sourceType || null;
    if (input.sourceId !== undefined) entry.sourceId = input.sourceId;
    if (input.notes !== undefined) entry.notes = (input.notes || "").trim() || null;

    await entry.save({ session });

    return mapPaymentEntry(entry);
  });
}

export async function deletePaymentEntry(paymentEntryId) {
  return withTransaction(async (session) => {
    const entry = await PaymentEntry.findById(paymentEntryId).session(session);
    if (!entry) {
      throw new HttpError(404, "Payment entry not found", "PAYMENT_ENTRY_NOT_FOUND");
    }
    await PaymentEntry.deleteOne({ _id: paymentEntryId }).session(session);
  });
}

export async function listOutstandingBalances(input = {}) {
  const storeFilter = input.storeId ? { store: input.storeId } : {};
  const sales = await Sale.find({ ...storeFilter, paymentStatus: { $in: ['pending', 'partial'] } }).populate('customer');

  const saleOutstandings = sales.map(s => ({
    source_type: 'sale',
    source_id: s._id.toString(),
    store_ref: s.store ? s.store.toString() : null,
    party_name: s.customer ? s.customer.fullName : 'Walk-in',
    reference_no: s.saleNo,
    total_amount: toMoney(s.grandTotal),
    paid_amount: toMoney(s.amountPaid),
    outstanding_amount: toMoney(Math.max(s.grandTotal - s.amountPaid, 0)),
    payment_status: s.paymentStatus,
    created_at: s.createdAt,
  }));

  return saleOutstandings.sort((a, b) => b.created_at - a.created_at);
}
