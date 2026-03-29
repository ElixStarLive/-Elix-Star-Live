import { Request, Response } from "express";
import { dbLoadCoinPackages } from "../lib/postgres";
import { logger } from "../lib/logger";

/** GET /api/coin-packages — return available coin packages from DB */
export async function handleGetCoinPackages(_req: Request, res: Response) {
  try {
    const packages = await dbLoadCoinPackages();
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    return res.status(200).json({ packages });
  } catch (err) {
    logger.error({ err }, "handleGetCoinPackages failed");
    return res.status(500).json({ error: "DATABASE_ERROR" });
  }
}
