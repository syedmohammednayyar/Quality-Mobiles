import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signAccessToken(payload) {
  const signOptions = {
    expiresIn: env.jwtAccessExpiresIn,
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
  };

  return jwt.sign(payload, env.jwtAccessSecret, {
    ...signOptions,
  });
}

export function verifyAccessToken(token) {
  const decoded = jwt.verify(token, env.jwtAccessSecret, {
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
  });

  if (!decoded || typeof decoded !== "object") {
    throw new Error("Invalid token payload");
  }

  const rawUserId = decoded.userId ?? decoded.id;
  const username = String(decoded.username || "");
  const roles = Array.isArray(decoded.roles)
    ? decoded.roles.map((role) => String(role))
    : [];
  const rawStoreId = decoded.store_id;
  const storeId =
    rawStoreId === null || rawStoreId === undefined || rawStoreId === ""
      ? null
      : String(rawStoreId);

  if (!rawUserId || !username || roles.length === 0) {
    throw new Error("Invalid token claims");
  }

  const userId = String(rawUserId);

  return { id: userId, userId, username, roles, store_id: storeId };
}
