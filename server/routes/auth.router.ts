import { Router } from "express";
import {
  handleLogin, handleRegister, handleLogout, handleMe,
  handleResendConfirmation, handleAppleStart, handleGuestLogin,
  handleDeleteAccount, handleForgotPassword, handleResetPassword,
} from "./auth";
import { authLimiter } from "../middleware/rateLimit";
import { validateBody } from "../middleware/validate";
import { loginSchema, registerSchema, emailOnlySchema, resetPasswordSchema } from "../validation/schemas";

const router = Router();
router.post("/login", authLimiter, validateBody(loginSchema), handleLogin);
router.post("/guest", authLimiter, handleGuestLogin);
router.post("/register", authLimiter, validateBody(registerSchema), handleRegister);
router.post("/logout", handleLogout);
router.post("/delete", handleDeleteAccount);
router.get("/me", handleMe);
router.post("/resend-confirmation", validateBody(emailOnlySchema), handleResendConfirmation);
router.post("/apple/start", handleAppleStart);
router.post("/forgot-password", authLimiter, validateBody(emailOnlySchema), handleForgotPassword);
router.post("/reset-password", authLimiter, validateBody(resetPasswordSchema), handleResetPassword);
export default router;
