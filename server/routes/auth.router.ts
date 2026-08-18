import { Router } from "express";
import {
  handleLogin, handleRegister, handleLogout, handleMe,
  handleResendConfirmation, handleVerifyEmail, handleAppleNative, handleAppleStart, handleGuestLogin,
  handleDeleteAccount, handleForgotPassword, handleResetPassword,
} from "./auth";
import { handlePostConsent } from "./authConsent";
import {
  handleTwoFactorStatus,
  handleTwoFactorEnroll,
  handleTwoFactorVerify,
  handleTwoFactorDisable,
} from "./auth2fa";
import { authLimiter, registerLimiter, twoFactorLimiter } from "../middleware/rateLimit";
import { validateBody } from "../middleware/validate";
import { loginSchema, registerSchema, emailOnlySchema, resetPasswordSchema, verifyEmailSchema } from "../validation/schemas";

const router = Router();
router.post("/login", authLimiter, validateBody(loginSchema), handleLogin);
router.post("/guest", authLimiter, handleGuestLogin);
router.post("/register", registerLimiter, authLimiter, validateBody(registerSchema), handleRegister);
router.post("/logout", handleLogout);
router.post("/delete", handleDeleteAccount);
router.get("/me", handleMe);
router.post("/consent", handlePostConsent);
router.get("/2fa/status", handleTwoFactorStatus);
router.post("/2fa/enroll", twoFactorLimiter, handleTwoFactorEnroll);
router.post("/2fa/verify", twoFactorLimiter, handleTwoFactorVerify);
router.post("/2fa/disable", twoFactorLimiter, handleTwoFactorDisable);
router.post("/resend-confirmation", authLimiter, validateBody(emailOnlySchema), handleResendConfirmation);
router.post("/verify-email", authLimiter, validateBody(verifyEmailSchema), handleVerifyEmail);
router.post("/apple/start", handleAppleStart);
router.post("/apple/native", authLimiter, handleAppleNative);
router.post("/forgot-password", authLimiter, validateBody(emailOnlySchema), handleForgotPassword);
router.post("/reset-password", authLimiter, validateBody(resetPasswordSchema), handleResetPassword);
export default router;
