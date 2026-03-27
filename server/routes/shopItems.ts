import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { dbListShopItems, dbCreateShopItem, type DbShopItemRow } from "../lib/postgres";
import { getOrCreateProfile } from "./profiles";

function requireAuth(req: Request, res: Response): { userId: string } | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session." });
    return null;
  }
  return { userId: payload.sub };
}

async function enrichSeller(row: DbShopItemRow) {
  const p = await getOrCreateProfile(row.user_id);
  return {
    ...row,
    seller: {
      username: p.username,
      display_name: p.displayName,
      avatar_url: p.avatarUrl,
    },
  };
}

/** GET /api/shop/items?category=&user_id=&limit= */
export async function handleListShopItems(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const category =
    typeof req.query.category === "string" ? req.query.category : undefined;
  const userId =
    typeof req.query.user_id === "string" ? req.query.user_id.trim() : undefined;
  const limit = Math.min(
    100,
    Math.max(1, Number(req.query.limit) || 50),
  );
  const rows = await dbListShopItems({
    category: category === "all" ? undefined : category,
    userId,
    activeOnly: true,
    limit,
  });
  return res.status(200).json({
    items: await Promise.all(rows.map((r) => enrichSeller(r))),
  });
}

/** POST /api/shop/items — create listing (auth) */
export async function handleCreateShopItem(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = requireAuth(req, res);
  if (!auth) return;

  const body = req.body as {
    title?: string;
    description?: string;
    price?: number;
    image_url?: string | null;
    category?: string;
  };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) {
    return res.status(400).json({ error: "valid price is required" });
  }
  const category =
    typeof body.category === "string" && body.category.trim()
      ? body.category.trim()
      : "other";
  const allowed = new Set([
    "clothing",
    "electronics",
    "accessories",
    "other",
  ]);
  const cat = allowed.has(category) ? category : "other";
  const image_url =
    typeof body.image_url === "string" && body.image_url.trim()
      ? body.image_url.trim().slice(0, 2000)
      : null;
  const description =
    typeof body.description === "string" ? body.description : "";

  const row = await dbCreateShopItem({
    user_id: auth.userId,
    title,
    description,
    price,
    image_url,
    category: cat,
  });
  if (!row) return res.status(500).json({ error: "Could not create shop item" });
  return res.status(201).json({ item: await enrichSeller(row) });
}
