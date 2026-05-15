export class HttpError extends Error {
  constructor(statusCode, message, code = "HTTP_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isHttpError(error) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    "code" in error,
  );
}
