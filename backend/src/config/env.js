import dotenv from "dotenv";

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function firstPresent(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return "";
}

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric environment variable: ${name}`);
  }
  return value;
}

function isHostedRuntime() {
  return process.env.RENDER || process.env.NODE_ENV === "production";
}

function isLocalMongoUrl(value) {
  const match = value.match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]+@)?([^/?]+)/i);
  if (!match) return false;

  return match[1]
    .split(",")
    .map((host) => {
      const normalized = host.trim().toLowerCase();
      if (normalized.startsWith("[")) {
        return normalized.slice(1).split("]")[0];
      }
      return normalized.split(":")[0];
    })
    .some((host) => host === "localhost" || host === "127.0.0.1" || host === "::1");
}

function databaseUrlFromEnv() {
  const value = firstPresent(["DATABASE_URL", "MONGODB_URI"]);
  if (!value) {
    throw new Error("Missing required environment variable: DATABASE_URL (or MONGODB_URI)");
  }

  if (isHostedRuntime() && isLocalMongoUrl(value)) {
    throw new Error(
      "DATABASE_URL points to localhost. Render cannot connect to a MongoDB server on your laptop; set DATABASE_URL or MONGODB_URI to a hosted MongoDB connection string."
    );
  }

  return value;
}

export const env = {
  port: numberFromEnv("PORT", 4000),
  databaseUrl: databaseUrlFromEnv(),
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "10h",
  refreshTokenDays: numberFromEnv("REFRESH_TOKEN_DAYS", 3650),
  refreshCookieName: process.env.REFRESH_COOKIE_NAME || "quality_mobiles_refresh",
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : process.env.NODE_ENV === "production",
  jwtIssuer: required("JWT_ISSUER"),
  jwtAudience: required("JWT_AUDIENCE"),
};
