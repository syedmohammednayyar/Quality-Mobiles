import PDFDocument from "pdfkit";
import { formatDate, formatDateTime, parseCalendarDate } from "../../utils/dateFormat.js";
import {
  BulkInventory, Buyback, Customer, Employee, Expense,
  LossRecord, PaymentEntry, PriceAdjustment, Product,
  Sale, SerializedInventory, StockLedger, Store, StoreInventory,
} from "../../db/models.js";
import { HttpError } from "../../utils/httpError.js";
import { buildStockView } from "./inventoryReport.js";
import { revenueSaleMatch } from "../sales/saleStatus.js";
import { countSaleCustomers, customerTypeLabel } from "../sales/customerIdentity.js";

const money = (value) => Number(value || 0);
const id    = (value) => String(value?._id || value || "");
const name  = (value, fallback = "") => value?.name || value?.fullName || value?.username || fallback;

// A retrieved sale line was returned to sellable stock, so it stops counting
// as revenue or as a unit sold. Sale-level totals are netted down by the
// running retrieval figures the sale carries; item-level ones skip the
// retrieved lines outright. Fully retrieved sales never reach here — they are
// excluded by the query's status match.
const saleNet   = (sale) => Math.max(0, money(sale.grandTotal) - money(sale.retrievedTotal));
const saleGross = (sale) => Math.max(0, money(sale.originalAmount || sale.grandTotal) - money(sale.retrievedOriginalTotal));
const liveItems = (sale) => (sale.items || []).filter((item) => !item.retrievedAt);

// Resolves the requested reporting window to a concrete [start, end] pair.
// Every branch returns real Date objects so the caller can build an indexed
// createdAt range query — the filtering always happens in the database, never
// by loading everything and filtering in JS.
export function buildDateRange(rangeKey, from, to, month, year) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day   = 86400000;
  const map = {
    today:      [today, today],
    yesterday:  [new Date(today.getTime() - day), new Date(today.getTime() - day)],
    this_week:  [new Date(today.getTime() - ((today.getDay() + 6) % 7) * day), today],
    this_month: [new Date(today.getFullYear(), today.getMonth(), 1), today],
    last_month: [new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0)],
    this_year:  [new Date(today.getFullYear(), 0, 1), today],
    last_year:  [new Date(today.getFullYear() - 1, 0, 1), new Date(today.getFullYear() - 1, 11, 31)],
    // Deliberately wide window rather than "no filter" so every downstream
    // query keeps the same indexed createdAt shape.
    all:        [new Date(2000, 0, 1), today],
  };

  // Month/Year picker: year alone → whole year; year + month → that month.
  if (rangeKey === "month_year") {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2000 || y > 2999) {
      throw new HttpError(400, "A valid year is required for month/year reporting", "REPORT_YEAR_REQUIRED");
    }
    if (month === undefined || month === null || month === "" || month === "all") {
      return [new Date(y, 0, 1), new Date(y, 11, 31)];
    }
    const m = Number(month);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new HttpError(400, "Month must be between 1 and 12", "REPORT_MONTH_INVALID");
    }
    return [new Date(y, m - 1, 1), new Date(y, m, 0)];
  }

  if (rangeKey === "custom") {
    if (!from || !to) throw new HttpError(400, "Custom date range requires both a From and To date", "REPORT_RANGE_REQUIRED");
    // Local calendar days: `new Date("2026-08-01")` parses as UTC midnight and
    // would report from 31/Jul on any server west of Greenwich.
    const start = parseCalendarDate(from);
    const end   = parseCalendarDate(to);
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new HttpError(400, "Custom date range contains an invalid date", "REPORT_RANGE_INVALID");
    }
    if (start > end) {
      throw new HttpError(400, "From date cannot be after To date", "REPORT_RANGE_ORDER");
    }
    return [start, end];
  }

  return map[rangeKey] || map.this_month;
}

function groupTrend(sales, buybacks, expenses, losses) {
  const rows = new Map();
  const row = (date) => {
    const key = new Date(date).toISOString().slice(0, 10);
    if (!rows.has(key)) rows.set(key, { date: key, grossSales: 0, netSales: 0, adjustments: 0, exchanges: 0, buybacks: 0, expenses: 0, loss: 0 });
    return rows.get(key);
  };
  sales.forEach((x) => {
    const r = row(x.createdAt);
    r.grossSales  += saleGross(x);
    r.netSales    += saleNet(x);
    r.adjustments += money(x.priceAdjustmentTotal);
    r.exchanges   += money(x.exchangeTotal);
  });
  buybacks.forEach((x)  => { row(x.createdAt).buybacks  += money(x.negotiatedPrice); });
  expenses.forEach((x)  => { row(x.expenseDate || x.createdAt).expenses += money(x.outCash) + money(x.outOnline); });
  (losses || []).forEach((x) => { row(x.createdAt).loss += money(x.lossAmount); });
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function getAdminReportOverview(filters) {
  const [start, endRaw] = buildDateRange(filters.quickRange, filters.fromDate, filters.toDate, filters.month, filters.year);
  const end = new Date(endRaw); end.setHours(23, 59, 59, 999);
  const storeIds  = filters.storeIds || [];
  const storeQuery = storeIds.length ? { store: { $in: storeIds } } : {};
  const dateQuery  = { createdAt: { $gte: start, $lte: end } };

  const [
    stores, sales, buybacks, expenses, payments,
    customers, employees, serialized, bulk, legacyInventory, transfers,
    priceAdjustments, losses,
  ] = await Promise.all([
    Store.find(storeIds.length ? { _id: { $in: storeIds }, isActive: true } : { isActive: true }).lean(),
    // Revenue-bearing sales only: a fully retrieved sale is excluded outright,
    // and the KPI reducers below net partially retrieved ones down by what
    // came back, so a returned device cannot overstate the period.
    Sale.find({ ...storeQuery, ...dateQuery, ...revenueSaleMatch }).populate("store customer employee items.product").sort({ createdAt: -1 }).limit(1000).lean(),
    Buyback.find({ ...storeQuery, ...dateQuery }).populate("store customer inventoryProduct createdBy").sort({ createdAt: -1 }).limit(1000).lean(),
    Expense.find({ ...storeQuery, ...dateQuery }).lean(),
    PaymentEntry.find({ ...storeQuery, ...dateQuery }).lean(),
    Customer.find(storeIds.length ? { store: { $in: storeIds } } : {}).populate("store").lean(),
    Employee.find(storeIds.length ? { store: { $in: storeIds } } : {}).populate("store user").lean(),
    SerializedInventory.find(storeQuery).populate("store product addedBy").sort({ createdAt: -1 }).limit(2000).lean(),
    BulkInventory.find(storeQuery).populate("store product addedBy").lean(),
    // Legacy fallback only — the same last resort the inventory screen falls
    // back to for a store whose stock predates the BulkInventory model.
    StoreInventory.find(storeQuery).populate("store").populate({ path: "items.product", match: { isActive: true } }).lean(),
    StockLedger.find({ ...storeQuery, ...dateQuery, referenceType: "stock_transfer" })
      .populate("store product createdBy").sort({ createdAt: -1 }).limit(2000).lean(),
    PriceAdjustment.find({ ...storeQuery, ...dateQuery }).populate("product employee store sale").sort({ createdAt: -1 }).limit(2000).lean(),
    LossRecord.find({ ...storeQuery, ...dateQuery, lossStatus: "active" })
      .populate("store employee customer product").sort({ createdAt: -1 }).limit(2000).lean(),
  ]);
  const exchangeBuybacks = buybacks.filter((x) => x.transactionType === "exchange" || x.linkedSale);

  // Stock on hand, read from every model that can hold it — see
  // inventoryReport.js for why reading only the serialized one left whole
  // stores reporting an empty inventory.
  const stock = buildStockView({ serialized, bulk, legacyInventory });

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const grossRevenue         = sales.reduce((sum, x) => sum + saleGross(x), 0);
  const netRevenue           = sales.reduce((sum, x) => sum + saleNet(x), 0);
  const totalPriceAdjustments= sales.reduce((sum, x) => sum + money(x.priceAdjustmentTotal), 0);
  const totalExchangeValue   = sales.reduce((sum, x) => sum + money(x.exchangeTotal), 0);
  const buybackCost          = buybacks.reduce((sum, x) => sum + money(x.negotiatedPrice), 0);
  const totalExpenses        = expenses.reduce((sum, x) => sum + money(x.outCash) + money(x.outOnline), 0);
  const inventoryValue       = stock.inventoryValue;
  const outstandingPayments  = payments.reduce((sum, x) => sum + money(x.outstandingAmount), 0);
  const productsSold         = sales.reduce((sum, x) => sum + liveItems(x).reduce((n, item) => n + money(item.quantity), 0), 0);
  const netProfit            = netRevenue - buybackCost - totalExpenses;

  // ── Loss Management KPIs ────────────────────────────────────────────────────
  const totalLoss            = losses.reduce((sum, x) => sum + money(x.lossAmount), 0);
  const lossItemCount        = losses.length;
  const lossTransactionCount = new Set(losses.map((x) => id(x.sale))).size;
  const averageLoss          = lossItemCount > 0 ? Number((totalLoss / lossItemCount).toFixed(2)) : 0;
  const totalProfit          = sales.reduce((sum, sale) => sum + liveItems(sale).reduce((s, item) => s + (money(item.grossResult) > 0 ? money(item.grossResult) : 0), 0), 0);
  const netGrossResult       = totalProfit - totalLoss;

  // ── Store performance ──────────────────────────────────────────────────────
  const storePerformance = stores.map((store) => {
    const sId          = id(store);
    const storeSales   = sales.filter((x) => id(x.store) === sId);
    return {
      storeCode:        store.code,
      storeName:        store.name,
      grossRevenue:     storeSales.reduce((sum, x) => sum + saleGross(x), 0),
      revenue:          storeSales.reduce((sum, x) => sum + saleNet(x), 0),
      priceAdjustments: storeSales.reduce((sum, x) => sum + money(x.priceAdjustmentTotal), 0),
      exchangeValue:    storeSales.reduce((sum, x) => sum + money(x.exchangeTotal), 0),
      sales:            storeSales.length,
      productsSold:     storeSales.reduce((sum, x) => sum + liveItems(x).reduce((n, item) => n + money(item.quantity), 0), 0),
      inventoryValue:   stock.valueForStore(sId),
      buybackValue:     buybacks.filter((x) => id(x.store) === sId).reduce((sum, x) => sum + money(x.negotiatedPrice), 0),
      employees:        employees.filter((x) => id(x.store) === sId && x.isActive !== false).length,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // ── Transfer rows ──────────────────────────────────────────────────────────
  const transferIn  = new Map(transfers.filter((x) => x.movementType === "transfer_in").map((x) => [id(x.referenceId), x]));
  const transferRows = transfers.filter((x) => x.movementType === "transfer_out").map((x) => {
    const dest = transferIn.get(id(x.referenceId));
    return { id: id(x.referenceId), jobNumber: x.product?.jobId || "", product: x.product?.name || "", fromStore: name(x.store), toStore: name(dest?.store), transferDate: x.createdAt, transferredBy: name(x.createdBy) };
  });

  // ── Sale rows (enhanced with price breakdown) ──────────────────────────────
  const saleRows = sales.flatMap((sale) => sale.items.map((item) => ({
    id:              id(sale),
    saleId:          sale.saleNo,
    jobNumber:       item.product?.jobId || sale.jobNumber || "",
    product:         item.product?.name || "",
    imei:            item.product?.imei || "",
    customer:        name(sale.customer, "Walk-in"),
    store:           name(sale.store),
    employee:        name(sale.employee, sale.salespersonName || ""),
    paymentMethod:   sale.payments?.[0]?.paymentMethod || "",
    listPrice:       money(item.originalUnitPrice || item.originalPrice || item.unitPrice),
    billedPrice:     money(item.adjustedUnitPrice  || item.unitPrice),
    priceAdjusted:   Boolean(item.priceWasAdjusted),
    adjustmentDelta: money(item.lineAdjustmentDelta),
    amount:          money(item.lineAdjustedTotal  || item.lineTotal),
    date:            sale.createdAt,
    // Per line, not per bill: on a partially retrieved sale the lines that
    // were not returned are still ordinary completed sales.
    status:          item.retrievedAt ? "retrieved" : sale.status,
    retrieved:       Boolean(item.retrievedAt),
    retrievedAt:     item.retrievedAt || null,
  })));

  // ── Inventory rows ─────────────────────────────────────────────────────────
  const inventoryRows = stock.rows;

  // ── Customers ──────────────────────────────────────────────────────────────
  const saleCustomers = countSaleCustomers(sales);

  // ── Customer rows ──────────────────────────────────────────────────────────
  const customerRows = customers.map((customer) => {
    const cSales = sales.filter((sale) => id(sale.customer) === id(customer));
    return {
      id: id(customer), customer: customer.fullName, phone: customer.phone || "",
      customerType: customerTypeLabel(customer.sourceType),
      purchases: cSales.length,
      grossSpending:  cSales.reduce((sum, x) => sum + saleGross(x), 0),
      spending:       cSales.reduce((sum, x) => sum + saleNet(x), 0),
      adjustments:    cSales.reduce((sum, x) => sum + money(x.priceAdjustmentTotal), 0),
      exchangeValue:  cSales.reduce((sum, x) => sum + money(x.exchangeTotal), 0),
      lastPurchase:   cSales[0]?.createdAt || null,
      store:          name(customer.store),
    };
  }).sort((a, b) => b.spending - a.spending);

  // ── Employee rows ──────────────────────────────────────────────────────────
  const employeeRows = employees.map((employee) => {
    const eSales = sales.filter((sale) => id(sale.employee) === id(employee));
    const eLosses = losses.filter((l) => id(l.employee) === id(employee));
    const eLossTotal = eLosses.reduce((sum, l) => sum + money(l.lossAmount), 0);
    return {
      id: id(employee), employee: employee.fullName, store: name(employee.store),
      role:             employee.user?.role || "Employee",
      sales:            eSales.length,
      grossRevenue:     eSales.reduce((sum, x) => sum + saleGross(x), 0),
      revenue:          eSales.reduce((sum, x) => sum + saleNet(x), 0),
      priceAdjustments: eSales.reduce((sum, x) => sum + money(x.priceAdjustmentTotal), 0),
      adjustmentCount:  priceAdjustments.filter((a) => id(a.employee) === id(employee)).length,
      productsSold:     eSales.reduce((sum, x) => sum + liveItems(x).length, 0),
      lastActivity:     eSales[0]?.createdAt || employee.updatedAt,
      lossTotal:        eLossTotal,
      lossTransactions: new Set(eLosses.map((l) => id(l.sale))).size,
      lossRate:         eSales.length > 0 ? Number(((new Set(eLosses.map((l) => id(l.sale))).size / eSales.length) * 100).toFixed(2)) : 0,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // ── Movement rows ──────────────────────────────────────────────────────────
  const movementRows = [
    ...serialized.map((x) => ({ id: `added-${id(x)}`, jobNumber: x.jobNumber || x.product?.jobId || "", imei: x.imei || "", product: x.product?.name || "", event: "Product Added", store: name(x.store), date: x.createdAt, by: name(x.addedBy), currentStatus: x.status })),
    ...stock.additions,
    ...transferRows.map((x) => ({ id: `transfer-${x.id}`, jobNumber: x.jobNumber, imei: "", product: x.product, event: `Transfer: ${x.fromStore} to ${x.toStore}`, store: x.toStore, date: x.transferDate, by: x.transferredBy, currentStatus: "transferred" })),
    ...saleRows.map((x) => ({ id: `sale-${x.id}-${x.jobNumber}`, jobNumber: x.jobNumber, imei: x.imei, product: x.product, event: x.retrieved ? `Retrieved: ${x.saleId}` : `Sold: ${x.saleId}`, store: x.store, date: x.date, by: x.employee, currentStatus: x.retrieved ? "retrieved" : "sold" })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // ── Price adjustment rows ──────────────────────────────────────────────────
  const adjustmentRows = priceAdjustments.map((adj) => ({
    id:               id(adj),
    saleId:           adj.sale?.saleNo || id(adj.sale),
    saleRef:          id(adj.sale),
    product:          adj.product?.name || id(adj.product),
    employee:         name(adj.employee),
    store:            name(adj.store),
    originalPrice:    money(adj.originalPrice),
    newPrice:         money(adj.newPrice),
    differenceAmount: money(adj.differenceAmount),
    differencePercent:money(adj.differencePercent),
    reasonCategory:   adj.reasonCategory || "other",
    reasonNote:       adj.reasonNote || "",
    date:             adj.createdAt,
  }));

  // ── Profitability rows (per product, serialized inventory sold in period) ──
  // Retrieved lines earned nothing — the device came back — so they are left
  // out of margin analysis rather than reported as profit or loss.
  const profitabilityRows = saleRows.filter((row) => !row.retrieved).map((row) => {
    const product = serialized.find((s) => s.product?.jobId === row.jobNumber || s.imei === row.imei)?.product
      || null;
    const purchasePrice = money(product?.purchasePrice);
    const grossMargin   = row.listPrice - purchasePrice;
    const netMargin     = row.billedPrice - purchasePrice;
    return {
      saleId:         row.saleId,
      jobNumber:      row.jobNumber,
      product:        row.product,
      imei:           row.imei,
      store:          row.store,
      employee:       row.employee,
      listPrice:      row.listPrice,
      billedPrice:    row.billedPrice,
      purchasePrice,
      grossMargin,
      netMargin,
      marginReduced:  row.priceAdjusted,
      adjustmentDelta:row.adjustmentDelta,
      date:           row.date,
    };
  });

  // ── Loss rows (Loss Management) ─────────────────────────────────────────────
  const lossRows = losses.map((l) => ({
    id:             id(l),
    lossId:         id(l),
    date:           l.createdAt,
    saleId:         l.saleNo,
    saleRef:        id(l.sale),
    store:          name(l.store),
    employee:       name(l.employee),
    product:        l.productName,
    imei:           l.imei || l.sku || "",
    costBasis:      money(l.costBasis),
    originalPrice:  money(l.originalSellingPrice),
    discount:       money(l.discountAmount),
    finalPrice:      money(l.effectiveSellingAmount),
    loss:           money(l.lossAmount),
    lossPercent:    money(l.lossPercentage),
    reason:         l.lossType,
    status:         l.lossStatus,
  }));

  // ── Adjustment category summary ────────────────────────────────────────────
  const adjustmentByCategory = priceAdjustments.reduce((acc, adj) => {
    const cat = adj.reasonCategory || "other";
    if (!acc[cat]) acc[cat] = { count: 0, totalDiscount: 0 };
    acc[cat].count++;
    acc[cat].totalDiscount += money(adj.differenceAmount);
    return acc;
  }, {});

  return {
    filters: { ...filters, fromDate: start, toDate: end },
    kpis: {
      totalSales:            sales.length,
      grossRevenue,
      netRevenue,
      totalRevenue:          netRevenue,
      totalPriceAdjustments,
      totalExchangeValue,
      productsSold,
      inventoryValue,
      // Customers who actually transacted in the period, counted by customer
      // record — the same rule the Dashboard KPI uses, so the two reconcile.
      // `customers` below is the registry and includes entries with no sales.
      totalCustomers:        saleCustomers.total,
      registeredCustomers:   customers.length,
      walkInCustomers:       saleCustomers.walkIn,
      referralCustomers:     saleCustomers.referred,
      anonymousWalkInSales:  saleCustomers.anonymousSales,
      totalBuybacks:         buybacks.length,
      totalEmployees:        employees.filter((x) => x.isActive !== false).length,
      totalTransfers:        transferRows.length,
      // Same rule as the dashboard and the inventory screen: a row with no
      // units left is out of stock, never low stock.
      lowStockProducts:      stock.lowStockProducts,
      outstandingPayments,
      buybackCost,
      totalExpenses,
      netProfit,
      adjustmentCount:       priceAdjustments.length,
      exchangeDeviceCount:   exchangeBuybacks.length,
      // ── Loss Management ──────────────────────────────────────────────────
      totalLoss,
      lossItemCount,
      lossTransactionCount,
      averageLoss,
      totalProfit,
      netGrossResult,
    },
    storePerformance,
    trends: groupTrend(sales, buybacks, expenses, losses),
    reports: {
      sales:        saleRows,
      inventory:    inventoryRows,
      movements:    movementRows,
      transfers:    transferRows,
      customers:    customerRows,
      employees:    employeeRows,
      losses:       lossRows,
      buybacks:     buybacks.map((x) => ({
        id: id(x), buybackId: id(x), jobNumber: x.jobNo || "",
        customer: name(x.customer, x.customerName), device: `${x.brand} ${x.model}`, imei: x.imei,
        condition: x.condition, buybackPrice: money(x.negotiatedPrice), resalePrice: money(x.marketValue),
        profit: money(x.marketValue) - money(x.negotiatedPrice), store: name(x.store), date: x.createdAt,
      })),
      // ── New enterprise reports ─────────────────────────────────────────
      priceAdjustments: adjustmentRows,
      exchanges:        exchangeBuybacks.map((x) => ({
        id: id(x),
        saleId: x.linkedSaleNo || id(x.linkedSale) || id(x),
        saleRef: id(x.linkedSale),
        customer: name(x.customer, x.customerName),
        store: name(x.destinationStore || x.store),
        employee: name(x.createdBy),
        brand: x.brand,
        model: x.model,
        imei: x.imei || x.serialNumber || "",
        storageCapacity: x.storageVariant || "",
        color: x.color || "",
        condition: x.condition,
        marketValue: money(x.marketValue),
        exchangeValue: money(x.negotiatedPrice),
        buybackStatus: x.inventoryStatus || x.status,
        date: x.createdAt,
      })),
      profitability:    profitabilityRows,
      financial: {
        grossRevenue,
        netRevenue,
        totalPriceAdjustments,
        totalExchangeValue,
        buybackCost,
        expenses:            totalExpenses,
        netProfit,
        outstandingPayments,
        adjustmentByCategory,
        totalLoss,
        totalProfit,
        netGrossResult,
      },
    },
  };
}

export async function streamReportPdf(res, payload, meta) {
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="business_control_report_${Date.now()}.pdf"`);
  doc.pipe(res);

  doc.fontSize(19).text("Quality Mobiles — Business Control Report", { align: "center" });
  doc.moveDown().fontSize(9).text(`Generated by ${meta.username} | ${formatDateTime(new Date())} | Scope: ${meta.storeLabel}`);

  // KPIs
  doc.moveDown().fontSize(13).text("Business Overview");
  const kpiLabels = {
    totalSales:            "Total Sales",
    grossRevenue:          "Gross Revenue (list prices)",
    netRevenue:            "Net Revenue (billed prices)",
    totalPriceAdjustments: "Total Price Adjustments",
    totalExchangeValue:    "Total Exchange Value Given",
    productsSold:          "Products Sold",
    totalBuybacks:         "Buybacks",
    buybackCost:           "Buyback Cost",
    totalExpenses:         "Total Expenses",
    netProfit:             "Net Profit",
    adjustmentCount:       "Price Adjustment Records",
    exchangeDeviceCount:   "Exchange Devices Received",
  };
  Object.entries(kpiLabels).forEach(([key, label]) => {
    const value = payload.kpis[key];
    if (value !== undefined) doc.fontSize(9).text(`${label}: Rs ${Number(value).toLocaleString()}`);
  });

  // Store performance
  doc.moveDown().fontSize(13).text("Store Performance");
  payload.storePerformance.forEach((row) => {
    doc.fontSize(9).text(`${row.storeName}: ${row.sales} sales | Gross Rs ${money(row.grossRevenue).toFixed(2)} | Net Rs ${money(row.revenue).toFixed(2)} | Adj Rs ${money(row.priceAdjustments).toFixed(2)}`);
  });

  // Price adjustment summary
  if (payload.reports?.priceAdjustments?.length) {
    doc.moveDown().fontSize(13).text("Price Adjustments Summary");
    const byCategory = payload.reports.financial.adjustmentByCategory || {};
    Object.entries(byCategory).forEach(([cat, data]) => {
      doc.fontSize(9).text(`${cat}: ${data.count} adjustments, total discount Rs ${money(data.totalDiscount).toFixed(2)}`);
    });
  }

  // Exchange summary
  if (payload.reports?.exchanges?.length) {
    doc.moveDown().fontSize(13).text("Exchange Devices");
    doc.fontSize(9).text(`Devices received: ${payload.reports.exchanges.length} | Total value: Rs ${money(payload.kpis.totalExchangeValue).toFixed(2)}`);
  }

  // Loss summary
  if (payload.kpis.totalLoss !== undefined) {
    doc.moveDown().fontSize(13).text("Loss Summary");
    doc.fontSize(9).text(`Total Loss: Rs ${money(payload.kpis.totalLoss).toFixed(2)} | Loss Transactions: ${payload.kpis.lossTransactionCount || 0} | Loss Items: ${payload.kpis.lossItemCount || 0} | Avg Loss: Rs ${money(payload.kpis.averageLoss).toFixed(2)}`);
    doc.fontSize(9).text(`Total Profit: Rs ${money(payload.kpis.totalProfit).toFixed(2)} | Net Gross Result: Rs ${money(payload.kpis.netGrossResult).toFixed(2)}`);
    if (payload.reports?.losses?.length) {
      const byReason = payload.reports.losses.reduce((acc, l) => {
        acc[l.reason] = (acc[l.reason] || 0) + Number(l.loss || 0);
        return acc;
      }, {});
      Object.entries(byReason).forEach(([reason, amount]) => {
        doc.fontSize(9).text(`${reason}: Rs ${money(amount).toFixed(2)}`);
      });
    }
  }

  doc.end();
}
