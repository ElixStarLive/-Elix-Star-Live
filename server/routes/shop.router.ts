import { Router } from "express";
import { createShopItemCheckout, getShopCheckoutSession } from "./checkout";
import { handleGetCoinPackages } from "./coinPackages";
import { handleListShopItems, handleCreateShopItem, handleUpdateShopItem, handleDeleteShopItem } from "./shopItems";
import { validateBody } from "../middleware/validate";
import { shopCheckoutSchema, shopCreateSchema } from "../validation/schemas";
import { shopCheckoutLimiter } from "../middleware/rateLimit";

const router = Router();
router.get("/items", handleListShopItems);
router.post("/items", validateBody(shopCreateSchema), handleCreateShopItem);
router.patch("/items/:id", validateBody(shopCreateSchema), handleUpdateShopItem);
router.delete("/items/:id", handleDeleteShopItem);
router.post("/checkout", shopCheckoutLimiter, validateBody(shopCheckoutSchema), createShopItemCheckout);
router.get("/checkout-session/:sessionId", getShopCheckoutSession);
export default router;

export const coinPackagesRouter = Router();
coinPackagesRouter.get("/", handleGetCoinPackages);
