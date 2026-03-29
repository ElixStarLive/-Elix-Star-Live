import { Router } from "express";
import { handleGetGiftCatalog, handleSendGift, handleGetSounds } from "./gifts";
import { validateBody } from "../middleware/validate";
import { sendGiftSchema } from "../validation/schemas";
import { giftSendLimiter } from "../middleware/rateLimit";

const router = Router();
router.get("/catalog", handleGetGiftCatalog);
router.post("/send", giftSendLimiter, validateBody(sendGiftSchema), handleSendGift);
export default router;

export const soundsRouter = Router();
soundsRouter.get("/", handleGetSounds);
