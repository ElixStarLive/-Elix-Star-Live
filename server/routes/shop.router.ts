import { Router } from "express";
import { createShopItemCheckout } from "./checkout";
import { handleGetCoinPackages } from "./coinPackages";
import { handleListShopItems, handleCreateShopItem } from "./shopItems";

const router = Router();
router.get("/items", handleListShopItems);
router.post("/items", handleCreateShopItem);
router.post("/checkout", createShopItemCheckout);
export default router;

export const coinPackagesRouter = Router();
coinPackagesRouter.get("/", handleGetCoinPackages);
