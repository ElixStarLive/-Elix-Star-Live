import { Router } from "express";
import { createShopItemCheckout } from "./checkout";
import { handleGetCoinPackages } from "./coinPackages";
import { handleListShopItems, handleCreateShopItem } from "./shopItems";
import { validateBody } from "../middleware/validate";
import { shopCheckoutSchema, shopCreateSchema } from "../validation/schemas";
import { shopCheckoutLimiter } from "../middleware/rateLimit";

const router = Router();
router.get("/items", handleListShopItems);
router.post("/items", validateBody(shopCreateSchema), handleCreateShopItem);
router.post("/checkout", shopCheckoutLimiter, validateBody(shopCheckoutSchema), createShopItemCheckout);
export default router;

export const coinPackagesRouter = Router();
coinPackagesRouter.get("/", handleGetCoinPackages);
