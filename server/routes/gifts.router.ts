import { Router } from "express";
import { handleGetGiftCatalog, handleSendGift } from "./gifts";
import { validateBody } from "../middleware/validate";
import { sendGiftSchema } from "../validation/schemas";
import { giftSendLimiter } from "../middleware/rateLimit";

const router = Router();
router.get("/catalog", handleGetGiftCatalog);
router.post("/send", giftSendLimiter, validateBody(sendGiftSchema), handleSendGift);
export default router;
