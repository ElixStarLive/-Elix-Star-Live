import { Router } from "express";
import { handleGetGiftCatalog, handleSendGift, handleGetSounds } from "./gifts";

const router = Router();
router.get("/catalog", handleGetGiftCatalog);
router.post("/send", handleSendGift);
export default router;

export const soundsRouter = Router();
soundsRouter.get("/", handleGetSounds);
