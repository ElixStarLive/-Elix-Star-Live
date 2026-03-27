export const GIFT_VALUES: Record<string, number> = {
  s_rose: 1,
  s_heart: 5,
  s_coffee: 15,
  s_diamond: 300,
  s_crown: 1500,
  s_panda: 10,
  s_butterfly: 25,
  s_cat: 50,
  s_dog: 100,
  s_sun: 250,
  s_rainbow: 500,
  s_unicorn: 1000,
  global_universe: 1000000,
  horse_gallop: 5000,
  rex_dino: 12000,
  treasure_chest: 15000,
  war_bird: 15000,
  kitty_treasure: 17000,
  frost_wolf: 18000,
  voyager_ship: 19000,
  fiery_lion: 21000,
  night_panther: 22000,
  titan_gorilla: 23000,
  misty_wolf: 25000,
  cosmic_panther: 26000,
  star_wand: 28000,
  beast_relic: 31000,
  crystal_rhino: 32000,
  storm_phoenix: 34000,
  ice_sorceress: 37000,
  fire_phoenix: 38000,
  lavarok: 40000,
  blazing_wizard: 42000,
  aelyra_flameveil: 45000,
  golden_lion: 46000,
  dragon_egg: 49000,
  lava_demon: 52000,
  dragon_wrath: 55000,
  flames_royalty: 55000,
  fire_unicorn: 55000,
  thunder_falcon: 58000,
  infernal_lion: 60000,
  fantasy_unicorn: 61000,
  sky_guardian: 64000,
  majestic_bird: 65000,
  flame_king: 65000,
  majestic_phoenix: 70000,
  molten_fury: 75000,
  universe: 80000,
  lava_rampage: 80000,
  guardian_chest: 85000,
  storm_warrior: 85000,
  pink_jet: 88000,
  frost_lion: 90000,
  night_owl: 90000,
  drake_cub: 95000,
  romantic_jet: 99000,
  guardian_vault: 100000,
  elix_gold_universe: 120000,
  lightning_hypercar: 150000,
};

export function getGiftValue(giftId: string): number {
  return GIFT_VALUES[giftId] || 0;
}

export function normalizeBattleTarget(
  rawTarget: unknown,
): "host" | "opponent" | null {
  if (rawTarget === "host" || rawTarget === "opponent") return rawTarget;
  if (rawTarget === "me") return "host";
  if (rawTarget === "player4") return "opponent";
  if (rawTarget === "player3") return "host";
  return null;
}
