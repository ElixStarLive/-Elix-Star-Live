/**
 * Official App Store / Play financial report CSV ingest + match to purchases.
 * Never invents commission — only values present in the report file.
 */
import { createHash, randomUUID } from "crypto";
import { getPool } from "../postgres";
import { logger } from "../logger";
import { applyVerifiedProceedsAdjustment } from "./storeSettlement";
import { gbpStringToPence } from "./moneyMath";

export type ParsedReportLine = {
  lineKey: string;
  externalTransactionId: string | null;
  productId: string | null;
  currency: string | null;
  grossPence: number;
  taxPence: number;
  commissionPence: number;
  netProceedsPence: number;
  quantity: number;
  raw: Record<string, string>;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseMoneyToPence(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[^0-9.\-]/g, "");
  if (!cleaned) return 0;
  try {
    return gbpStringToPence(cleaned);
  } catch {
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }
}

function headerIndex(headers: string[], names: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().replace(/\s+/g, " ").trim());
  for (const name of names) {
    const i = lower.indexOf(name.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

/** Apple Payments / Financial Reports style CSV (flexible column names). */
export function parseAppleFinancialCsv(csv: string): ParsedReportLine[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  const iTxn = headerIndex(headers, ["transaction id", "apple identifier", "order id", "sales or return"]);
  const iSku = headerIndex(headers, ["sku", "product id", "vendor identifier"]);
  const iCurrency = headerIndex(headers, ["customer currency", "currency of proceeds", "currency"]);
  const iCustomerPrice = headerIndex(headers, ["customer price", "extended partner share", "partner share"]);
  const iProceeds = headerIndex(headers, ["developer proceeds", "extended partner share", "proceeds"]);
  const iQty = headerIndex(headers, ["quantity", "units"]);

  const out: ParsedReportLine[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r]);
    if (cols.every((c) => !c)) continue;
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = cols[idx] ?? "";
    });
    const gross = parseMoneyToPence(iCustomerPrice >= 0 ? cols[iCustomerPrice] : undefined);
    const net = parseMoneyToPence(iProceeds >= 0 ? cols[iProceeds] : undefined);
    const commission = Math.max(0, gross - net);
    const ext =
      iTxn >= 0 && cols[iTxn]
        ? cols[iTxn]
        : `apple_row_${r}_${createHash("sha256").update(lines[r]).digest("hex").slice(0, 12)}`;
    out.push({
      lineKey: createHash("sha256").update(lines[r]).digest("hex"),
      externalTransactionId: ext || null,
      productId: iSku >= 0 ? cols[iSku] || null : null,
      currency: iCurrency >= 0 ? (cols[iCurrency] || null) : null,
      grossPence: Math.abs(gross),
      taxPence: 0,
      commissionPence: Math.abs(commission),
      netProceedsPence: Math.abs(net || gross - commission),
      quantity: iQty >= 0 ? Math.max(1, Math.floor(Number(cols[iQty]) || 1)) : 1,
      raw,
    });
  }
  return out;
}

/** Google Play earnings CSV (flexible). */
export function parseGoogleEarningsCsv(csv: string): ParsedReportLine[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  const iOrder = headerIndex(headers, ["description", "order number", "transaction id", "order id"]);
  const iSku = headerIndex(headers, ["product id", "sku"]);
  const iCurrency = headerIndex(headers, ["merchant currency", "buyer currency", "currency"]);
  const iAmount = headerIndex(headers, ["amount (merchant currency)", "amount", "charged amount"]);
  const iFee = headerIndex(headers, ["fee", "google fee", "service fee"]);
  const iTax = headerIndex(headers, ["tax amount", "taxes"]);

  const out: ParsedReportLine[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r]);
    if (cols.every((c) => !c)) continue;
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = cols[idx] ?? "";
    });
    const amount = parseMoneyToPence(iAmount >= 0 ? cols[iAmount] : undefined);
    const fee = Math.abs(parseMoneyToPence(iFee >= 0 ? cols[iFee] : undefined));
    const tax = Math.abs(parseMoneyToPence(iTax >= 0 ? cols[iTax] : undefined));
    // Google earnings amount is often net; reconstruct gross ≈ net + fee + tax when fee present
    const net = Math.abs(amount);
    const gross = net + fee + tax;
    const ext =
      iOrder >= 0 && cols[iOrder]
        ? cols[iOrder]
        : `google_row_${r}_${createHash("sha256").update(lines[r]).digest("hex").slice(0, 12)}`;
    out.push({
      lineKey: createHash("sha256").update(lines[r]).digest("hex"),
      externalTransactionId: ext || null,
      productId: iSku >= 0 ? cols[iSku] || null : null,
      currency: iCurrency >= 0 ? (cols[iCurrency] || null) : null,
      grossPence: gross,
      taxPence: tax,
      commissionPence: fee,
      netProceedsPence: net,
      quantity: 1,
      raw,
    });
  }
  return out;
}

export async function importStoreFinancialReport(input: {
  store: "apple" | "google";
  reportType: string;
  reportPeriod?: string;
  sourceFilename: string;
  csvText: string;
  importedBy: string;
}): Promise<{
  ok: boolean;
  reportId?: string;
  lineCount?: number;
  matched?: number;
  unmatched?: number;
  error?: string;
  alreadyImported?: boolean;
}> {
  const pool = getPool();
  if (!pool) return { ok: false, error: "database_error" };
  const importHash = createHash("sha256").update(input.csvText).digest("hex");
  const existing = await pool.query(
    `SELECT id FROM elix_store_financial_reports WHERE import_hash = $1 LIMIT 1`,
    [importHash],
  );
  if (existing.rowCount) {
    return { ok: true, reportId: String(existing.rows[0].id), alreadyImported: true };
  }

  const parsed =
    input.store === "apple"
      ? parseAppleFinancialCsv(input.csvText)
      : parseGoogleEarningsCsv(input.csvText);
  if (parsed.length === 0) return { ok: false, error: "empty_or_unparsed_report" };

  const reportId = `sfr_${randomUUID()}`;
  const client = await pool.connect();
  let matched = 0;
  let unmatched = 0;
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO elix_store_financial_reports
         (id, store, report_type, report_period, source_filename, import_hash, imported_by, line_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        reportId,
        input.store,
        input.reportType,
        input.reportPeriod ?? null,
        input.sourceFilename,
        importHash,
        input.importedBy,
        parsed.length,
      ],
    );

    for (const line of parsed) {
      let matchStatus: "unmatched" | "matched" = "unmatched";
      let matchedPurchaseId: string | null = null;
      if (line.externalTransactionId) {
        const purch = await client.query(
          `SELECT provider_transaction_id FROM elix_paid_coin_lots
            WHERE provider_transaction_id = $1 LIMIT 1`,
          [line.externalTransactionId],
        ).catch(() => ({ rowCount: 0, rows: [] as { provider_transaction_id: string }[] }));
        if (purch.rowCount) {
          matchStatus = "matched";
          matchedPurchaseId = String(purch.rows[0].provider_transaction_id);
          matched += 1;
        } else {
          const memb = await client.query(
            `SELECT latest_order_id FROM elix_membership_purchases
              WHERE latest_order_id = $1 OR purchase_token_hash = $1 LIMIT 1`,
            [line.externalTransactionId],
          ).catch(() => ({ rowCount: 0, rows: [] as { latest_order_id: string }[] }));
          if (memb.rowCount) {
            matchStatus = "matched";
            matchedPurchaseId = String(memb.rows[0].latest_order_id || line.externalTransactionId);
            matched += 1;
          } else {
            unmatched += 1;
          }
        }
      } else {
        unmatched += 1;
      }

      await client.query(
        `INSERT INTO elix_store_financial_report_lines
           (report_id, line_key, external_transaction_id, product_id, currency,
            gross_pence, tax_pence, commission_pence, net_proceeds_pence, quantity,
            matched_purchase_id, match_status, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
        [
          reportId,
          line.lineKey,
          line.externalTransactionId,
          line.productId,
          line.currency,
          line.grossPence,
          line.taxPence,
          line.commissionPence,
          line.netProceedsPence,
          line.quantity,
          matchedPurchaseId,
          matchStatus,
          JSON.stringify(line.raw),
        ],
      );
    }

    await client.query(
      `UPDATE elix_store_financial_reports SET matched_count = $2, unmatched_count = $3 WHERE id = $1`,
      [reportId, matched, unmatched],
    );
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    logger.error({ err }, "importStoreFinancialReport failed");
    return { ok: false, error: "database_error" };
  } finally {
    client.release();
  }

  // Apply verified proceeds outside the import TX (each adjustment is idempotent)
  for (const line of parsed) {
    if (!line.externalTransactionId) continue;
    if (line.currency && line.currency.toUpperCase() !== "GBP") continue;
    try {
      await applyVerifiedProceedsAdjustment({
        provider: input.store === "apple" ? "apple" : "google",
        providerTransactionId: line.externalTransactionId,
        appStoreDeductionPence: line.commissionPence,
        taxDeductionPence: line.taxPence,
        processingDeductionPence: 0,
        netPence: line.netProceedsPence,
        webhookEventId: `finrpt:${reportId}:${line.lineKey}`,
      });
    } catch (err) {
      logger.warn({ err, ext: line.externalTransactionId }, "proceeds adjustment skipped");
    }
  }

  return { ok: true, reportId, lineCount: parsed.length, matched, unmatched };
}
