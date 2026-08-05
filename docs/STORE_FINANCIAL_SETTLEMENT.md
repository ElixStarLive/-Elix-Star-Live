# App Store / Play financial settlement — what verification provides vs reports

**Status:** operational procedure. Do not treat purchase-verification APIs as final net proceeds.

## 1. What Apple purchase verification provides

| Field | Available via StoreKit / App Store Server API / JWS? | Notes |
|-------|------------------------------------------------------|-------|
| Product ID | Yes | `productId` |
| Transaction ID | Yes | `transactionId` / `originalTransactionId` |
| Purchase date | Yes | |
| Environment (Sandbox/Production) | Yes | |
| Price | Sometimes | JWS may include `price` (milliunits) + `currency` |
| Currency | Sometimes | With price |
| Store commission % | **No** | Not in verifyReceipt / transaction info |
| Tax withheld | **No** | Not in verification APIs |
| Net proceeds to developer | **No** | Only in Financial Reports / Payments and Proceeds |
| FX conversion | **No** | Reports only |

Elix may use Apple JWS `price`+`currency=GBP` as **provisional** gross evidence after verification. That is **not** final settlement truth.

## 2. What Google Play purchase verification provides

| Field | Available via Play Developer API? | Notes |
|-------|-----------------------------------|-------|
| Product ID | Yes | |
| Purchase token / order ID | Yes | |
| Purchase state | Yes | |
| Price | List/catalog or `priceAmountMicros` in some product APIs | Not always on purchase get |
| Store commission | **No** | Earnings reports only |
| Tax | **No** | Earnings / tax reports |
| Net proceeds | **No** | Play Console earnings export / Reporting API |

## 3. Official report sources (final settlement)

### Apple
- **Payments and Financial Reports** (App Store Connect → Sales and Trends / Payments and Financial Reports)
- Download CSV / TSV for the period
- Columns typically include: Transaction Date, Settlement Date, Apple Identifier, SKU, Title, Developer Proceeds, Customer Price, Currency, Country, Quantity, etc.
- Commission and tax are implied by Customer Price vs Developer Proceeds (or explicit columns depending on report version)

### Google
- **Earnings reports** (Play Console → Download reports → Financial)
- Or Google Play Developer Reporting / Cloud Storage bucket exports
- Columns typically include: Description, Transaction Date, Tax Type, Tax Amount, Buyer Currency, Amount (Buyer Currency), Merchant Currency, Amount (Merchant Currency), Fee, etc.

## 4. Elix ingest process (admin)

1. Admin opens `/admin/monetisation` → **Financial reports**.
2. Upload official Apple or Google CSV for a closed period.
3. Server computes `import_hash` (SHA-256 of file bytes) — duplicate uploads rejected.
4. Each row becomes `elix_store_financial_report_lines` with:
   - `gross_pence`, `tax_pence`, `commission_pence`, `net_proceeds_pence`
   - `external_transaction_id` / `product_id` when present
   - `match_status` = `unmatched` until linked
5. Matcher links lines to `elix_processed_iap` / paid-coin lots / promote / membership by external transaction id or order id.
6. Matched lines call `applyVerifiedProceedsAdjustment` — **only then** are store commission/tax treated as verified.
7. Unmatched lines stay flagged for manual ops review.
8. Later correction files create new report rows + adjustment ledger entries (never rewrite history).

## 5. What must remain PARTIAL until a report is imported

- Gift/sub/promote GBP splits that used catalog or JWS gross with **zero** commission
- Any dashboard “net revenue” that has not been reconciled to a report line

## 6. Security

- Report files accepted only from authenticated admins
- Raw file bytes not stored in client; optional server retention off by default
- No invented 15%/30% commission fallback
