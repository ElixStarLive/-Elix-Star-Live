import { Router } from "express";
import {
  handleLogin, handleRegister, handleLogout, handleMe,
  handleResendConfirmation, handleAppleStart, handleGuestLogin,
  handleDeleteAccount, handleForgotPassword, handleResetPassword,
} from "./auth";
import { authLimiter } from "../middleware/rateLimit";

const router = Router();
router.post("/login", authLimiter, handleLogin);
router.post("/guest", authLimiter, handleGuestLogin);
router.post("/register", authLimiter, handleRegister);
router.post("/logout", handleLogout);
router.post("/delete", handleDeleteAccount);
router.get("/me", handleMe);
router.post("/resend-confirmation", handleResendConfirmation);
router.post("/apple/start", handleAppleStart);
router.post("/forgot-password", authLimiter, handleForgotPassword);
router.post("/reset-password", authLimiter, handleResetPassword);
export default router;
