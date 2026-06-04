import { HttpError } from "../utils/httpError.js";

export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new HttpError(401, "Authentication required", "AUTH_REQUIRED"));
      return;
    }

    const normalizedRoles = req.auth.roles.map((role) =>
      role === "cashier" || role === "inventory_manager" ? "employee" : role
    );
    const normalizedAllowed = allowedRoles.map((role) =>
      role === "cashier" || role === "inventory_manager" ? "employee" : role
    );
    const hasRole = normalizedRoles.some((role) => normalizedAllowed.includes(role));
    if (!hasRole) {
      next(
        new HttpError(403, "Access not available for this role", "AUTH_FORBIDDEN"),
      );
      return;
    }

    next();
  };
}
