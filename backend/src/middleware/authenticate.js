import { verifyAccessToken } from "../utils/jwt.js";
import { HttpError } from "../utils/httpError.js";
import { AuthSession, User } from "../db/models.js";

export async function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next(new HttpError(401, "Missing bearer token", "AUTH_MISSING_TOKEN"));
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    req.auth = verifyAccessToken(token);
    if (req.auth.sessionId) {
      const [session, user] = await Promise.all([
        AuthSession.findById(req.auth.sessionId).select("revokedAt expiresAt").lean(),
        User.findById(req.auth.userId).select("isActive").lean(),
      ]);
      if (!session || session.revokedAt || session.expiresAt <= new Date() || user?.isActive === false) {
        throw new Error("Session revoked");
      }
    }
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token", "AUTH_INVALID_TOKEN"));
  }
}
