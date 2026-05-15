import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { getCurrentUser, login } from "./auth.service.js";

const loginSchema = z.object({
  username: z.string().min(3).max(100),
  password: z.string().min(8).max(200),
});

export async function loginHandler(req, res, next) {
  try {
    const input = loginSchema.parse(req.body);
    const result = await login(input);
    res.status(200).json(result);
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
