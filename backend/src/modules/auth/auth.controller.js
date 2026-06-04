import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { env } from "../../config/env.js";
import {
  getCurrentUser,
  login,
  refreshLogin,
  revokeAllUserSessions,
  revokeRefreshSession,
} from "./auth.service.js";

const loginSchema = z.object({
  username: z.string().min(3).max(100),
  password: z.string().min(8).max(200),
});

export async function loginHandler(req, res, next) {
  try {
    const input = loginSchema.parse(req.body);
    const result = await login(input, requestMetadata(req));
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json(publicResult(result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(
        new HttpError(
          400,
          error.issues[0]?.message || "Invalid request",
          "VALIDATION_ERROR",
        ),
      );
      return;
    }
    next(error);
  }
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key]) => key)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]),
  );
}

function requestMetadata(req) {
  return {
    deviceId: req.headers["x-device-id"],
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip,
  };
}

function setRefreshCookie(res, token) {
  res.cookie(env.refreshCookieName, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: env.refreshTokenDays * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(env.refreshCookieName, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/api/v1/auth",
  });
}

function publicResult({ accessToken, refreshExpiresAt, user }) {
  return { accessToken, refreshExpiresAt, user };
}

export async function refreshHandler(req, res, next) {
  try {
    const token = parseCookies(req)[env.refreshCookieName];
    const result = await refreshLogin(token, requestMetadata(req));
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json(publicResult(result));
  } catch (error) {
    clearRefreshCookie(res);
    next(error);
  }
}

export async function logoutHandler(req, res, next) {
  try {
    await revokeRefreshSession(parseCookies(req)[env.refreshCookieName]);
    clearRefreshCookie(res);
    res.status(200).json({ detail: "Logged out." });
  } catch (error) {
    next(error);
  }
}

export async function logoutAllHandler(req, res, next) {
  try {
    await revokeAllUserSessions(req.auth.userId);
    clearRefreshCookie(res);
    res.status(200).json({ detail: "Logged out from all devices." });
  } catch (error) {
    next(error);
  }
}

export async function meHandler(req, res, next) {
  try {
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }

    const user = await getCurrentUser(req.auth.userId);
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
}
