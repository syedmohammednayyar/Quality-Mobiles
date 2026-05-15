import { HttpError } from "../utils/httpError.js";

export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new HttpError(401, "Authentication required", "AUTH_REQUIRED"));
      return;
    }

    const hasRole = req.auth.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      next(
        new HttpError(403, "Forbidden: insufficient role", "AUTH_FORBIDDEN"),
      );
      return;
    }

    next();
  };
}
