import { isHttpError } from "../utils/httpError.js";

export function errorHandler(error, _req, res, _next) {
  console.error('Error caught by error handler:', error);
  if (isHttpError(error)) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  const message =
    error instanceof Error ? error.message : "Internal server error";
  console.error('Sending 500 error:', message);
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message,
    },
  });
}
