import { Request, Response } from "express";

/** GET /api/coin-packages — return available coin packages for platform IAP display */
export async function handleGetCoinPackages(_req: Request, res: Response) {
  const packages = [
    {
      id: "coins_10",
      coins: 10,
      price: 0.05,
      label: "10 Coins",
      bonus_coins: 0,
      is_popular: false,
    },
    {
      id: "coins_50",
      coins: 50,
      price: 0.18,
      label: "50 Coins",
      bonus_coins: 0,
      is_popular: false,
    },
    {
      id: "coins_100",
      coins: 100,
      price: 0.35,
      label: "100 Coins",
      bonus_coins: 0,
      is_popular: false,
    },
    {
      id: "coins_500",
      coins: 500,
      price: 1.75,
      label: "500 Coins",
      bonus_coins: 50,
      is_popular: false,
    },
    {
      id: "coins_1000",
      coins: 1000,
      price: 3.5,
      label: "1,000 Coins",
      bonus_coins: 100,
      is_popular: true,
    },
    {
      id: "coins_2000",
      coins: 2000,
      price: 7.0,
      label: "2,000 Coins",
      bonus_coins: 200,
      is_popular: false,
    },
    {
      id: "coins_5000",
      coins: 5000,
      price: 17.5,
      label: "5,000 Coins",
      bonus_coins: 500,
      is_popular: false,
    },
    {
      id: "coins_10000",
      coins: 10000,
      price: 35.0,
      label: "10K Coins",
      bonus_coins: 1000,
      is_popular: false,
    },
    {
      id: "coins_50000",
      coins: 50000,
      price: 175.0,
      label: "50K Coins",
      bonus_coins: 5000,
      is_popular: false,
    },
    {
      id: "coins_100000",
      coins: 100000,
      price: 350.0,
      label: "100K Coins",
      bonus_coins: 10000,
      is_popular: false,
    },
  ];
  res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
  return res.status(200).json({ packages });
}
