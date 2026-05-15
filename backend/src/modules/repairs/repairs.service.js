import { Repair, Store, Customer } from "../../db/models.js";
import { withTransaction } from "../../db/mongodb.js";
import { HttpError } from "../../utils/httpError.js";

function toMoney(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, "Invalid money value", "REPAIR_INVALID_AMOUNT");
  }
  return parsed.toFixed(2);
}

function toDbStatus(status) {
  if (status === "In Progress") return "in_progress";
  return status.toLowerCase();
}

function toApiStatus(status) {
  if (status === "in_progress") return "In Progress";
  if (status === "completed") return "Completed";
  if (status === "delivered") return "Delivered";
  if (status === "cancelled") return "Cancelled";
  return "Pending";
}

function normalizeParts(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item;
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
      const qty = Number(candidate.qty || 0);
      const unitCost = Number(candidate.unitCost || 0);
      const status = candidate.status === "Purchased" ? "Purchased" : "Pending";

      if (
        !name ||
        !Number.isFinite(qty) ||
        qty <= 0 ||
        !Number.isFinite(unitCost) ||
        unitCost < 0
      ) {
        return null;
      }

      return {
        name,
        qty: Math.trunc(qty),
        unitCost,
        status,
      };
    })
    .filter((entry) => entry !== null);
}

function computePaymentLifecycle(input) {
  const totalDue = input.partsCharge + input.laborCost;
  const paidAmount = input.gotAmount + input.inCash + input.inOnline;

  if (paidAmount > totalDue + 0.009) {
    throw new HttpError(
      400,
      "Paid amount cannot exceed total due",
      "REPAIR_OVERPAYMENT",
    );
  }

  const outstandingAmount = Math.max(0, totalDue - paidAmount);

  if (outstandingAmount <= 0.009) {
    return { paymentStatus: "paid", outstandingAmount: 0 };
  }

  if (paidAmount > 0) {
    return { paymentStatus: "partial", outstandingAmount };
  }

  return { paymentStatus: "pending", outstandingAmount };
}

function mapRepair(doc) {
  return {
    id: doc._id.toString(),
    ticket_no: doc.ticketNo,
    customer_name: doc.customerName,
    customer: doc.customer ? doc.customer.toString() : null,
    store_ref: doc.store ? doc.store.toString() : null,
    device_model: doc.deviceModel,
    problem: doc.problem || "",
    technician_name: doc.technicianName || "",
    status: toApiStatus(doc.status),
    parts: normalizeParts(doc.parts),
    parts_charge: toMoney(doc.partsCharge),
    labor_cost: toMoney(doc.laborCost),
    got_amount: toMoney(doc.gotAmount),
    in_cash: toMoney(doc.inCash),
    in_online: toMoney(doc.inOnline),
    out_cash: toMoney(doc.outCash),
    out_online: toMoney(doc.outOnline),
    warranty: doc.warranty,
    estimated_completion: doc.estimatedCompletion,
    notes: doc.notes || "",
    payment_status: doc.paymentStatus,
    outstanding_amount: toMoney(doc.outstandingAmount),
    created_at: doc.createdAt,
  };
}

async function requireStore(storeId) {
  const store = await Store.findOne({ _id: storeId, isActive: { $ne: false } });
  if (!store) {
    throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
  }
}

async function requireCustomer(customerId) {
  const customer = await Customer.findById(customerId);
  if (!customer) {
    throw new HttpError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  }
}

export async function listRepairs(input = {}) {
  const query = input.storeId ? { store: input.storeId } : {};
  const repairs = await Repair.find(query).sort({ createdAt: -1 });
  return repairs.map(mapRepair);
}

export async function createRepair(input, userId) {
  return withTransaction(async (session) => {
    const ticketNo = input.ticketNo.trim();
    const customerName = input.customerName.trim();
    const deviceModel = input.deviceModel.trim();

    if (!ticketNo || !customerName || !deviceModel) {
      throw new HttpError(
        400,
        "Ticket number, customer name and device model are required",
        "REPAIR_REQUIRED_FIELDS",
      );
    }

    if (input.storeRef) {
      await requireStore(input.storeRef);
    }

    if (input.customer) {
      await requireCustomer(input.customer);
    }

    const partsCharge = Number(toMoney(input.partsCharge));
    const laborCost = Number(toMoney(input.laborCost));
    const gotAmount = Number(toMoney(input.gotAmount));
    const inCash = Number(toMoney(input.inCash));
    const inOnline = Number(toMoney(input.inOnline));
    const outCash = Number(toMoney(input.outCash));
    const outOnline = Number(toMoney(input.outOnline));

    const lifecycle = computePaymentLifecycle({
      partsCharge,
      laborCost,
      gotAmount,
      inCash,
      inOnline,
    });

    const status = input.status || "Pending";
    if (status === "Delivered" && lifecycle.outstandingAmount > 0) {
      throw new HttpError(
        409,
        "Repair cannot be delivered until payment is complete",
        "REPAIR_PAYMENT_PENDING",
      );
    }

    const existingRepair = await Repair.findOne({ ticketNo }).session(session);
    if (existingRepair) {
      throw new HttpError(
        409,
        "Repair ticket number already exists",
        "REPAIR_DUPLICATE_TICKET",
      );
    }

    const [repair] = await Repair.create([{
      ticketNo,
      customerName,
      customer: input.customer || null,
      store: input.storeRef || null,
      deviceModel,
      problem: (input.problem || "").trim() || null,
      technicianName: (input.technicianName || "").trim() || null,
      status: toDbStatus(status),
      parts: input.parts || [],
      partsCharge,
      laborCost,
      gotAmount,
      inCash,
      inOnline,
      outCash,
      outOnline,
      paymentStatus: lifecycle.paymentStatus,
      outstandingAmount: lifecycle.outstandingAmount,
      warranty: input.warranty || "3 months",
      estimatedCompletion: input.estimatedCompletion || null,
      notes: (input.notes || "").trim() || null,
      createdBy: userId,
    }], { session });

    return mapRepair(repair);
  });
}

export async function updateRepair(repairId, input) {
  return withTransaction(async (session) => {
    const repair = await Repair.findById(repairId).session(session);
    if (!repair) {
      throw new HttpError(404, "Repair ticket not found", "REPAIR_NOT_FOUND");
    }

    const nextStoreId = input.storeRef !== undefined ? input.storeRef : repair.store;
    const nextCustomerId = input.customer !== undefined ? input.customer : repair.customer;

    if (nextStoreId) {
      await requireStore(nextStoreId);
    }

    if (nextCustomerId) {
      await requireCustomer(nextCustomerId);
    }

    const nextTicketNo = input.ticketNo !== undefined ? input.ticketNo.trim() : repair.ticketNo;
    const nextCustomerName = input.customerName !== undefined ? input.customerName.trim() : repair.customerName;
    const nextDeviceModel = input.deviceModel !== undefined ? input.deviceModel.trim() : repair.deviceModel;

    if (!nextTicketNo || !nextCustomerName || !nextDeviceModel) {
      throw new HttpError(
        400,
        "Ticket number, customer name and device model are required",
        "REPAIR_REQUIRED_FIELDS",
      );
    }

    const partsCharge = Number(input.partsCharge !== undefined ? toMoney(input.partsCharge) : toMoney(repair.partsCharge));
    const laborCost = Number(input.laborCost !== undefined ? toMoney(input.laborCost) : toMoney(repair.laborCost));
    const gotAmount = Number(input.gotAmount !== undefined ? toMoney(input.gotAmount) : toMoney(repair.gotAmount));
    const inCash = Number(input.inCash !== undefined ? toMoney(input.inCash) : toMoney(repair.inCash));
    const inOnline = Number(input.inOnline !== undefined ? toMoney(input.inOnline) : toMoney(repair.inOnline));
    const outCash = Number(input.outCash !== undefined ? toMoney(input.outCash) : toMoney(repair.outCash));
    const outOnline = Number(input.outOnline !== undefined ? toMoney(input.outOnline) : toMoney(repair.outOnline));

    const lifecycle = computePaymentLifecycle({
      partsCharge,
      laborCost,
      gotAmount,
      inCash,
      inOnline,
    });

    const nextStatus = input.status || toApiStatus(repair.status);
    if (nextStatus === "Delivered" && lifecycle.outstandingAmount > 0) {
      throw new HttpError(
        409,
        "Repair cannot be delivered until payment is complete",
        "REPAIR_PAYMENT_PENDING",
      );
    }

    repair.ticketNo = nextTicketNo;
    repair.customerName = nextCustomerName;
    repair.customer = nextCustomerId;
    repair.store = nextStoreId;
    repair.deviceModel = nextDeviceModel;
    if (input.problem !== undefined) repair.problem = (input.problem || "").trim() || null;
    if (input.technicianName !== undefined) repair.technicianName = (input.technicianName || "").trim() || null;
    repair.status = toDbStatus(nextStatus);
    if (input.parts !== undefined) repair.parts = input.parts;
    repair.partsCharge = partsCharge;
    repair.laborCost = laborCost;
    repair.gotAmount = gotAmount;
    repair.inCash = inCash;
    repair.inOnline = inOnline;
    repair.outCash = outCash;
    repair.outOnline = outOnline;
    repair.paymentStatus = lifecycle.paymentStatus;
    repair.outstandingAmount = lifecycle.outstandingAmount;
    if (input.warranty !== undefined) repair.warranty = input.warranty;
    if (input.estimatedCompletion !== undefined) repair.estimatedCompletion = input.estimatedCompletion;
    if (input.notes !== undefined) repair.notes = (input.notes || "").trim() || null;

    await repair.save({ session });

    return mapRepair(repair);
  });
}

export async function deleteRepair(repairId) {
  return withTransaction(async (session) => {
    const repair = await Repair.findById(repairId).session(session);
    if (!repair) {
      throw new HttpError(404, "Repair ticket not found", "REPAIR_NOT_FOUND");
    }
    await Repair.deleteOne({ _id: repairId }).session(session);
  });
}
