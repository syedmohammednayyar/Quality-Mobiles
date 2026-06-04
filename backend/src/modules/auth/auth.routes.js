import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import {
  loginHandler,
  logoutAllHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
} from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/login", loginHandler);
authRouter.post("/refresh", refreshHandler);
authRouter.post("/logout", logoutHandler);
authRouter.post("/logout-all", authenticate, logoutAllHandler);
authRouter.get("/me", authenticate, meHandler);
