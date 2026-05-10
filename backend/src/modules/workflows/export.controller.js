import * as exportService from "./export.service.js";
import PDFDocument from "pdfkit";
import { sanitizeCsvValue } from "./export.service.js";

export async function exportSalesCSVHandler(req, res, next) {
  try {
    const { storeId, fromDate, toDate } = req.query;

    const result = await exportService.exportSalesToCSV(
      {
        storeId: storeId ? parseInt(storeId, 10) : undefined,
        fromDate: fromDate,
        toDate: toDate,
      },
      req.auth.id,
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sales_export_${Date.now()}.csv"`,
    );
    res.send(result.csv);
  } catch (error) {
    next(error);
  }
}

export async function exportInventoryCSVHandler(req, res, next) {
  try {
    const { storeId } = req.query;

    const result = await exportService.exportInventoryToCSV(
      {
        storeId: storeId ? parseInt(storeId, 10) : undefined,
      },
      req.auth.id,
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="inventory_export_${Date.now()}.csv"`,
    );
    res.send(result.csv);
  } catch (error) {
    next(error);
  }
}

export async function exportChangeRequestsCSVHandler(req, res, next) {
  try {
    const { fromDate, toDate } = req.query;

    const result = await exportService.exportChangeRequestsToCSV(
      {
        fromDate: fromDate,
        toDate: toDate,
      },
      req.auth.id,
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="change_requests_export_${Date.now()}.csv"`,
    );
    res.send(result.csv);
  } catch (error) {
    next(error);
  }
}

export async function getExportHistoryHandler(req, res, next) {
  try {
    const result = await exportService.getExportHistory();

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function exportInventoryPDFHandler(req, res, next) {
  try {
    const { storeId } = req.query;

    const rows = await exportService.exportInventoryRows(
      { storeId: storeId ? parseInt(storeId, 10) : undefined },
      req.auth.id,
    );

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="inventory_export_${Date.now()}.pdf"`,
    );

    doc.pipe(res);

    doc.fontSize(16).text("Inventory Export", { align: "center" });
    doc.moveDown(1);

    const tableTop = doc.y;
    const rowHeight = 18;
    const colWidths = [80, 160, 80, 50, 50, 60, 60, 60];

    // Header
    doc.fontSize(10).font("Helvetica-Bold");
    const headers = [
      "SKU",
      "Product",
      "Category",
      "Store",
      "Qty",
      "Reserved",
      "Unit Price",
      "Total",
    ];
    let x = doc.x;
    headers.forEach((h, i) => {
      doc.text(h, x, tableTop, {
        width: colWidths[i],
        continued: i !== headers.length - 1,
      });
      x += colWidths[i];
    });
    doc.moveDown();
    doc.font("Helvetica");

    // Rows
    rows.forEach((r) => {
      let x = doc.x;
      const y = doc.y;
      const cols = [
        r.sku,
        r.product_name,
        r.category,
        String(r.store_id),
        String(r.quantity),
        String(r.reserved_quantity),
        r.unit_price,
        r.total_value,
      ];
      cols.forEach((c, i) => {
        doc.text(sanitizeCsvValue(c), x, y, {
          width: colWidths[i],
          continued: i !== cols.length - 1,
        });
        x += colWidths[i];
      });
      doc.moveDown();
    });

    doc.end();
  } catch (error) {
    next(error);
  }
}
