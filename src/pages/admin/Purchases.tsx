import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DollarSign } from "lucide-react";
import { request } from "../../lib/apiClient";
import { showToast } from "../../lib/toast";

type Tab = "iap" | "shop";

export default function AdminPurchases() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("iap");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const path =
      tab === "iap" ? "/api/admin/iap-purchases" : "/api/admin/shop-purchases";
    const { data, error: err } = await request<{
      data?: Record<string, unknown>[];
    }>(path);
    if (err) {
      setError(err.message || "Failed to load");
      setRows([]);
      showToast(err.message || "Failed to load purchases");
    } else {
      setRows(Array.isArray(data?.data) ? data.data : []);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-[#111111] text-white p-6">
      <div className="max-w-5xl mx-auto">
        <button
          type="button"
          className="text-white/50 text-sm mb-4"
          onClick={() => navigate("/admin")}
        >
          ← Admin
        </button>
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <DollarSign className="w-7 h-7 text-[#C9A227]" />
          Purchases
        </h1>
        <p className="text-sm text-white/50 mb-4">
          IAP coin purchases and Stripe shop checkouts are separate ledgers.
        </p>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setTab("iap")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              tab === "iap" ? "bg-[#C9A227] text-black" : "bg-white/10"
            }`}
          >
            Coin IAP
          </button>
          <button
            type="button"
            onClick={() => setTab("shop")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              tab === "shop" ? "bg-[#C9A227] text-black" : "bg-white/10"
            }`}
          >
            Shop (Stripe)
          </button>
        </div>

        {loading ? (
          <p className="text-white/50">Loading…</p>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-white/40 text-sm">No purchases found.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 text-white/50">
                <tr>
                  <th className="p-2">When</th>
                  <th className="p-2">User / session</th>
                  <th className="p-2">Detail</th>
                  <th className="p-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={String(r.id ?? i)} className="border-t border-white/5">
                    <td className="p-2 text-white/60 whitespace-nowrap">
                      {r.created_at
                        ? new Date(String(r.created_at)).toLocaleString()
                        : "—"}
                    </td>
                    <td className="p-2 font-mono text-white/70">
                      {String(
                        r.user_id ?? r.stripe_session_id ?? r.idempotency_key ?? "—",
                      ).slice(0, 28)}
                    </td>
                    <td className="p-2 text-white/70">
                      {String(
                        r.product_id ?? r.item_id ?? r.kind ?? r.provider ?? "—",
                      )}
                    </td>
                    <td className="p-2 tabular-nums text-[#C9A227]">
                      {r.coins_delta != null
                        ? String(r.coins_delta)
                        : r.price_minor != null
                          ? `$${(Number(r.price_minor) / 100).toFixed(2)}`
                          : r.amount != null
                            ? String(r.amount)
                            : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
