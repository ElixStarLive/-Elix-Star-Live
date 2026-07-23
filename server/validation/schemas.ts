import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(1).max(30).optional(),
  displayName: z.string().max(100).optional(),
});

export const emailOnlySchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8),
  token: z.string().optional(),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const sendGiftSchema = z.object({
  room_id: z.string().min(1).optional(),
  gift_id: z.string().min(1).optional(),
  giftId: z.string().min(1).optional(),
  streamKey: z.string().min(1).optional(),
  transaction_id: z.string().optional(),
  recipient_id: z.string().optional(),
  channel: z.string().optional(),
  gift_source: z.enum(["starter_coins", "paid_coins"]).optional(),
}).refine(data => data.room_id || data.streamKey, { message: "room_id or streamKey required" })
  .refine(data => data.gift_id || data.giftId, { message: "gift_id or giftId required" });

export const trackViewSchema = z.object({
  videoId: z.string().min(1),
  watchTime: z.number().optional(),
  videoDuration: z.number().optional(),
  completed: z.boolean().optional(),
});

export const trackInteractionSchema = z.object({
  videoId: z.string().min(1),
  type: z.enum(["like", "comment", "share", "save"]),
  data: z.unknown().optional(),
});

export const liveStartSchema = z.object({
  room: z.string().min(1),
  displayName: z.string().min(1).optional(),
});

export const liveEndSchema = z.object({
  room: z.string().min(1),
});

export const shopCheckoutSchema = z
  .object({
    // Legacy single-item checkout (still supported).
    itemId: z.string().min(1).optional(),
    // Basket checkout: pay for multiple items in one Stripe session.
    items: z
      .array(z.object({ id: z.string().min(1) }))
      .min(1)
      .max(10)
      .optional(),
  })
  .refine((d) => !!d.itemId || (Array.isArray(d.items) && d.items.length > 0), {
    message: "itemId or items required",
  });

export const shopCreateSchema = z.object({
  title: z.string().min(1).max(200),
  price: z.number().min(0),
  description: z.string().max(5000).optional().default(""),
  image_url: z.string().url().optional().nullable(),
  category: z.string().optional().default("other"),
});

export const verifyPurchaseSchema = z.object({
  userId: z.string().min(1),
  packageId: z.string().min(1),
  provider: z.enum(["apple", "google"]),
  transactionId: z.string().min(1),
  receipt: z.string().optional(),
});

export const profilePatchSchema = z.object({
  username: z.string().trim().min(1).max(30).optional(),
  displayName: z.string().trim().max(100).optional(),
  bio: z.string().max(500).optional(),
  website: z.string().max(200).optional(),
  // avatarUrl may be an https URL or a data: URL (inline image), so allow a generous size.
  avatarUrl: z.string().max(5_000_000).optional(),
});

export const blockUserSchema = z.object({
  blockedUserId: z.string().min(1),
});

export const reportSchema = z.object({
  targetType: z.string().min(1).optional().default("unknown"),
  targetId: z.string().min(1).optional().default(""),
  reason: z.string().min(1),
  details: z.string().optional().default(""),
});
