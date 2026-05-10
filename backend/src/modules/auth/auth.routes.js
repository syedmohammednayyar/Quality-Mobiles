import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { loginHandler, meHandler, signupHandler } from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/login", loginHandler);
authRouter.post("/signup", signupHandler);
authRouter.get("/me", authenticate, meHandler);
