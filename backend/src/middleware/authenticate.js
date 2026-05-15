import { verifyAccessToken } from "../utils/jwt.js";
import { HttpError } from "../utils/httpError.js";

export function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next(new HttpError(401, "Missing bearer token", "AUTH_MISSING_TOKEN"));
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token", "AUTH_INVALID_TOKEN"));
  }
}
