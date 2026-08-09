import { HttpError } from "../utils/httpError.js";

/**
 * Role gate. Accepts role names, optionally followed by an options object
 * `{ message }` to give a specific, user-facing denial reason instead of the
 * generic one (e.g. "You do not have permission to edit product details.").
 */
export function authorize(...allowedRoles) {
  const last = allowedRoles[allowedRoles.length - 1];
  const options = last && typeof last === "object" ? allowedRoles.pop() : {};
  const deniedMessage = options.message || "Access not available for this role";

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
      next(new HttpError(403, deniedMessage, "AUTH_FORBIDDEN"));
      return;
    }

    next();
  };
}
