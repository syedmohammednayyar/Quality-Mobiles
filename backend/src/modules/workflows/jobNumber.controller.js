import * as jobNumberService from "./jobNumber.service.js";

export async function linkJobNumberHandler(req, res, next) {
  try {
    const productId = parseInt(req.params.productId, 10);
    const { jobNumber } = req.body;

    const result = await jobNumberService.linkJobNumberToProduct({
      productId,
      jobNumber,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getProductByJobNumberHandler(req, res, next) {
  try {
    const { jobNumber } = req.params;

    const result = await jobNumberService.getProductByJobNumber(jobNumber);

    if (!result) {
      res.status(404).json({
        success: false,
        error: "Product not found for this job number",
      });
      return;
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function searchInventoryByJobNumberHandler(req, res, next) {
  try {
    const { jobNumber } = req.query;

    if (!jobNumber || typeof jobNumber !== "string") {
      res.status(400).json({
        success: false,
        error: "Job number query parameter is required",
      });
      return;
    }

    const result = await jobNumberService.searchInventoryByJobNumber(jobNumber);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function unlinkJobNumberHandler(req, res, next) {
  try {
    const productId = parseInt(req.params.productId, 10);

    const result = await jobNumberService.unlinkJobNumber(productId);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
