import PDFDocument from "pdfkit";
import {
  BulkInventory, Buyback, Customer, Employee, Expense,
  ExchangeDevice, PaymentEntry, PriceAdjustment, Product,
  Sale, SerializedInventory, StockLedger, Store,
} from "../../db/models.js";
import { HttpError } from "../../utils/httpError.js";

const money = (value) => Number(value || 0);
const id    = (value) => String(value?._id || value || "");
const name  = (value, fallback = "") => value?.name || value?.fullName || value?.username || fallback;

function buildDateRange(rangeKey, from, to) {
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
  };
  if (rangeKey === "custom") {
    if (!from || !to) throw new HttpError(400, "Custom date range requires from/to", "REPORT_RANGE_REQUIRED");
    return [new Date(from), new Date(to)];
  }
  return map[rangeKey] || map.this_month;
}

function groupTrend(sales, buybacks, expenses) {
  const rows = new Map();
  const row = (date) => {
    const key = new Date(date).toISOString().slice(0, 10);
    if (!rows.has(key)) rows.set(key, { date: key, grossSales: 0, netSales: 0, adjustments: 0, exchanges: 0, buybacks: 0, expenses: 0 });
    return rows.get(key);
  };
  sales.forEach((x) => {
    const r = row(x.createdAt);
    r.grossSales  += money(x.originalAmount || x.grandTotal);
    r.netSales    += money(x.grandTotal);
    r.adjustments += money(x.priceAdjustmentTotal);
    r.exchanges   += money(x.exchangeTotal);
  });
  buybacks.forEach((x)  => { row(x.createdAt).buybacks  += money(x.negotiatedPrice); });
  expenses.forEach((x)  => { row(x.expenseDate || x.createdAt).expenses += money(x.outCash) + money(x.outOnline); });
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function getAdminReportOverview(filters) {
  const [start, endRaw] = buildDateRange(filters.quickRange, filters.fromDate, filters.toDate);
  const end = new Date(endRaw); end.setHours(23, 59, 59, 999);
  const storeIds  = filters.storeIds || [];
  const storeQuery = storeIds.length ? { store: { $in: storeIds } } : {};
  const dateQuery  = { createdAt: { $gte: start, $lte: end } };

  const [
    stores, sales, buybacks, expenses, payments,
    customers, employees, serialized, bulk, transfers,
    priceAdjustments, exchangeDevices,
  ] = await Promise.all([
    Store.find(storeIds.length ? { _id: { $in: storeIds }, isActive: true } : { isActive: true }).lean(),
    Sale.find({ ...storeQuery, ...dateQuery }).populate("store customer employee items.product").sort({ createdAt: -1 }).limit(1000).lean(),
    Buyback.find({ ...storeQuery, ...dateQuery }).populate("store customer inventoryProduct createdBy").sort({ createdAt: -1 }).limit(1000).lean(),
    Expense.find({ ...storeQuery, ...dateQuery }).lean(),
    PaymentEntry.find({ ...storeQuery, ...dateQuery }).lean(),
    Customer.find(storeIds.length ? { store: { $in: storeIds } } : {}).populate("store").lean(),
    Employee.find(storeIds.length ? { store: { $in: storeIds } } : {}).populate("store user").lean(),
    SerializedInventory.find(storeQuery).populate("store product addedBy").sort({ createdAt: -1 }).limit(2000).lean(),
    BulkInventory.find(storeQuery).populate("store product").lean(),
    StockLedger.find({ ...storeQuery, ...dateQuery, referenceType: "stock_transfer" })
      .populate("store product createdBy").sort({ createdAt: -1 }).limit(2000).lean(),
    PriceAdjustment.find({ ...storeQuery, ...dateQuery }).populate("product employee store sale").sort({ createdAt: -1 }).limit(2000).lean(),
    ExchangeDevice.find({ ...storeQuery, ...dateQuery }).populate("employee store sale customer").sort({ createdAt: -1 }).limit(2000).lean(),
  ]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const grossRevenue         = sales.reduce((sum, x) => sum + money(x.originalAmount || x.grandTotal), 0);
  const netRevenue           = sales.reduce((sum, x) => sum + money(x.grandTotal), 0);
  const totalPriceAdjustments= sales.reduce((sum, x) => sum + money(x.priceAdjustmentTotal), 0);
  const totalExchangeValue   = sales.reduce((sum, x) => sum + money(x.exchangeTotal), 0);
  const buybackCost          = buybacks.reduce((sum, x) => sum + money(x.negotiatedPrice), 0);
  const totalExpenses        = expenses.reduce((sum, x) => sum + money(x.outCash) + money(x.outOnline), 0);
  const inventoryValue       = serialized.filter((x) => x.status === "in_stock").reduce((sum, x) => sum + money(x.product?.unitPrice), 0)
    + bulk.reduce((sum, x) => sum + money(x.quantity) * money(x.product?.unitPrice), 0);
  const outstandingPayments  = payments.reduce((sum, x) => sum + money(x.outstandingAmount), 0);
  const productsSold         = sales.reduce((sum, x) => sum + x.items.reduce((n, item) => n + money(item.quantity), 0), 0);
  const netProfit            = netRevenue - buybackCost - totalExpenses;

  // ── Store performance ──────────────────────────────────────────────────────
  const storePerformance = stores.map((store) => {
    const sId          = id(store);
    const storeSales   = sales.filter((x) => id(x.store) === sId);
    const storeSerialized = serialized.filter((x) => id(x.store) === sId && x.status === "in_stock");
    const storeBulk    = bulk.filter((x) => id(x.store) === sId);
    return {
      storeId:          sId,
      storeName:        store.name,
      grossRevenue:     storeSales.reduce((sum, x) => sum + money(x.originalAmount || x.grandTotal), 0),
      revenue:          storeSales.reduce((sum, x) => sum + money(x.grandTotal), 0),
      priceAdjustments: storeSales.reduce((sum, x) => sum + money(x.priceAdjustmentTotal), 0),
      exchangeValue:    storeSales.reduce((sum, x) => sum + money(x.exchangeTotal), 0),
      sales:            storeSales.length,
      productsSold:     storeSales.reduce((sum, x) => sum + x.items.reduce((n, item) => n + money(item.quantity), 0), 0),
      inventoryValue:   storeSerialized.reduce((sum, x) => sum + money(x.product?.unitPrice), 0) + storeBulk.reduce((sum, x) => sum + money(x.quantity) * money(x.product?.unitPrice), 0),
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
    status:          sale.status,
  })));

  // ── Inventory rows ─────────────────────────────────────────────────────────
  const inventoryRows = serialized.map((x) => ({
    id: id(x), jobNumber: x.jobNumber || x.product?.jobId || "",
    brand: x.product?.brand || "", model: x.product?.model || x.product?.name || "",
    imei: x.imei || x.product?.imei || "", store: name(x.store),
    purchasePrice: money(x.product?.purchasePrice), sellingPrice: money(x.product?.unitPrice),
    status: x.status, transferStatus: x.status === "transferred" ? "Transferred" : "-",
  }));

  // ── Customer rows ──────────────────────────────────────────────────────────
  const customerRows = customers.map((customer) => {
    const cSales = sales.filter((sale) => id(sale.customer) === id(customer));
    return {
      id: id(customer), customer: customer.fullName, phone: customer.phone || "",
      purchases: cSales.length,
      grossSpending:  cSales.reduce((sum, x) => sum + money(x.originalAmount || x.grandTotal), 0),
      spending:       cSales.reduce((sum, x) => sum + money(x.grandTotal), 0),
      adjustments:    cSales.reduce((sum, x) => sum + money(x.priceAdjustmentTotal), 0),
      exchangeValue:  cSales.reduce((sum, x) => sum + money(x.exchangeTotal), 0),
      lastPurchase:   cSales[0]?.createdAt || null,
      store:          name(customer.store),
    };
  }).sort((a, b) => b.spending - a.spending);

  // ── Employee rows ──────────────────────────────────────────────────────────
  const employeeRows = employees.map((employee) => {
    const eSales = sales.filter((sale) => id(sale.employee) === id(employee));
    return {
      id: id(employee), employee: employee.fullName, store: name(employee.store),
      role:             employee.user?.role || "Employee",
      sales:            eSales.length,
      grossRevenue:     eSales.reduce((sum, x) => sum + money(x.originalAmount || x.grandTotal), 0),
      revenue:          eSales.reduce((sum, x) => sum + money(x.grandTotal), 0),
      priceAdjustments: eSales.reduce((sum, x) => sum + money(x.priceAdjustmentTotal), 0),
      adjustmentCount:  priceAdjustments.filter((a) => id(a.employee) === id(employee)).length,
      productsSold:     eSales.reduce((sum, x) => sum + x.items.length, 0),
      lastActivity:     eSales[0]?.createdAt || employee.updatedAt,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // ── Movement rows ──────────────────────────────────────────────────────────
  const movementRows = [
    ...serialized.map((x) => ({ id: `added-${id(x)}`, jobNumber: x.jobNumber || x.product?.jobId || "", imei: x.imei || "", product: x.product?.name || "", event: "Product Added", store: name(x.store), date: x.createdAt, by: name(x.addedBy), currentStatus: x.status })),
    ...transferRows.map((x) => ({ id: `transfer-${x.id}`, jobNumber: x.jobNumber, imei: "", product: x.product, event: `Transfer: ${x.fromStore} to ${x.toStore}`, store: x.toStore, date: x.transferDate, by: x.transferredBy, currentStatus: "transferred" })),
    ...saleRows.map((x) => ({ id: `sale-${x.id}-${x.jobNumber}`, jobNumber: x.jobNumber, imei: x.imei, product: x.product, event: `Sold: ${x.saleId}`, store: x.store, date: x.date, by: x.employee, currentStatus: "sold" })),
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

  // ── Exchange device rows ───────────────────────────────────────────────────
  const exchangeRows = exchangeDevices.map((dev) => ({
    id:            id(dev),
    saleId:        dev.sale?.saleNo || id(dev.sale),
    saleRef:       id(dev.sale),
    customer:      dev.customer ? name(dev.customer) : "Walk-in",
    store:         name(dev.store),
    employee:      name(dev.employee),
    brand:         dev.brand,
    model:         dev.model,
    imei:          dev.imei || "",
    storageCapacity:dev.storageCapacity || "",
    color:         dev.color || "",
    condition:     dev.condition,
    marketValue:   money(dev.marketValue),
    exchangeValue: money(dev.exchangeValue),
    buybackStatus: dev.buybackStatus || "received",
    date:          dev.createdAt,
  }));

  // ── Profitability rows (per product, serialized inventory sold in period) ──
  const profitabilityRows = saleRows.map((row) => {
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
      totalCustomers:        customers.length,
      totalBuybacks:         buybacks.length,
      totalEmployees:        employees.filter((x) => x.isActive !== false).length,
      totalTransfers:        transferRows.length,
      lowStockProducts:      bulk.filter((x) => money(x.quantity) <= money(x.minStockLevel)).length,
      outstandingPayments,
      buybackCost,
      totalExpenses,
      netProfit,
      adjustmentCount:       priceAdjustments.length,
      exchangeDeviceCount:   exchangeDevices.length,
    },
    storePerformance,
    trends: groupTrend(sales, buybacks, expenses),
    reports: {
      sales:        saleRows,
      inventory:    inventoryRows,
      movements:    movementRows,
      transfers:    transferRows,
      customers:    customerRows,
      employees:    employeeRows,
      buybacks:     buybacks.map((x) => ({
        id: id(x), buybackId: id(x), jobNumber: x.jobNo || "",
        customer: name(x.customer, x.customerName), device: `${x.brand} ${x.model}`, imei: x.imei,
        condition: x.condition, buybackPrice: money(x.negotiatedPrice), resalePrice: money(x.marketValue),
        profit: money(x.marketValue) - money(x.negotiatedPrice), store: name(x.store), date: x.createdAt,
      })),
      // ── New enterprise reports ─────────────────────────────────────────
      priceAdjustments: adjustmentRows,
      exchanges:        exchangeRows,
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
  doc.moveDown().fontSize(9).text(`Generated by ${meta.username} | ${new Date().toLocaleString()} | Scope: ${meta.storeLabel}`);

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

  doc.end();
}
