/**
 * Integer-pence money math for creator monetisation.
 * Never use floating-point after the catalog/string boundary conversion.
 */

export type RevenueSplit = {
  creatorPence: number;
  platformPence: number;
  creatorPct: number;
  platformPct: number;
  netPence: number;
};

export function assertNonNegInt(n: number, label: string): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative integer (pence)`);
  }
  return n;
}

/** Convert catalog GBP number to pence once at the DB/catalog boundary. */
export function catalogGbpNumberToPence(price: number): number {
  if (!Number.isFinite(price) || price < 0) return 0;
  return Math.round(price * 100);
}

/** Parse a decimal GBP string (e.g. "9.99") to integer pence without float math. */
export function gbpStringToPence(raw: string): number {
  const s = String(raw || "").trim().replace(/[^0-9.]/g, "");
  if (!s) return 0;
  const [whole, frac = ""] = s.split(".");
  const units = Math.max(0, parseInt(whole || "0", 10) || 0);
  const frac2 = (frac + "00").slice(0, 2);
  const pencePart = parseInt(frac2, 10) || 0;
  return units * 100 + pencePart;
}

/** Play Money units+nanos → pence (GBP only). */
export function moneyPartsToGbpPence(parts: {
  currencyCode: string;
  units: string;
  nanos: number;
}): number | null {
  if (String(parts.currencyCode || "").toUpperCase() !== "GBP") return null;
  const units = Math.max(0, Math.floor(Number(parts.units) || 0));
  const nanos = Math.max(0, Math.min(999_999_999, Math.floor(Number(parts.nanos) || 0)));
  return units * 100 + Math.floor(nanos / 10_000_000);
}

/**
 * Split net revenue using integer floor for creator share; remainder to platform
 * so creator + platform always equals net exactly (no missing pennies).
 */
export function splitNetRevenue(
  netPence: number,
  creatorPct: number,
  platformPct: number,
): RevenueSplit {
  const net = assertNonNegInt(netPence, "netPence");
  if (!Number.isInteger(creatorPct) || !Number.isInteger(platformPct)) {
    throw new Error("percentages must be integers");
  }
  if (creatorPct < 0 || platformPct < 0 || creatorPct + platformPct !== 100) {
    throw new Error("creatorPct + platformPct must equal 100");
  }
  const creatorPence = Math.floor((net * creatorPct) / 100);
  const platformPence = net - creatorPence;
  return {
    creatorPence,
    platformPence,
    creatorPct,
    platformPct,
    netPence: net,
  };
}

/** Promote Video: creator always £0; platform keeps 100% of net. */
export function promotePlatformOnly(netPence: number): RevenueSplit {
  const net = assertNonNegInt(netPence, "netPence");
  return {
    creatorPence: 0,
    platformPence: net,
    creatorPct: 0,
    platformPct: 100,
    netPence: net,
  };
}

/**
 * Net after verified deductions. All inputs are integer pence.
 * Never invent store fees — pass actual verified deduction amounts (0 if none yet).
 */
export function netAfterDeductions(input: {
  grossPence: number;
  appStoreDeductionPence?: number;
  taxDeductionPence?: number;
  processingDeductionPence?: number;
  refundPence?: number;
  chargebackPence?: number;
}): number {
  const gross = assertNonNegInt(input.grossPence, "grossPence");
  const app = assertNonNegInt(input.appStoreDeductionPence ?? 0, "appStoreDeductionPence");
  const tax = assertNonNegInt(input.taxDeductionPence ?? 0, "taxDeductionPence");
  const proc = assertNonNegInt(input.processingDeductionPence ?? 0, "processingDeductionPence");
  const refund = assertNonNegInt(input.refundPence ?? 0, "refundPence");
  const cb = assertNonNegInt(input.chargebackPence ?? 0, "chargebackPence");
  const net = gross - app - tax - proc - refund - cb;
  return Math.max(0, net);
}

/**
 * Proportional integer allocation: floor(spendCoins * totalPence / totalCoins).
 * Remainder stays unallocated (caller may leave on lot).
 */
export function allocateProportionalPence(
  spendCoins: number,
  totalCoins: number,
  totalPence: number,
): number {
  const spend = assertNonNegInt(spendCoins, "spendCoins");
  const total = assertNonNegInt(totalCoins, "totalCoins");
  const pence = assertNonNegInt(totalPence, "totalPence");
  if (total <= 0 || spend <= 0) return 0;
  if (spend > total) {
    throw new Error("spendCoins cannot exceed totalCoins");
  }
  return Math.floor((spend * pence) / total);
}
