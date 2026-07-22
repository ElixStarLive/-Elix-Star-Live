import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet } from "lucide-react";
import { request } from "../../lib/apiClient";
import { showToast } from "../../lib/toast";

type PayoutRow = {
  id: string;
  user_id: string;
  username?: string;
  display_name?: string;
  coins_amount: number;
  status: string;
  admin_note?: string | null;
  processed_by?: string | null;
  processed_at?: string | null;
  created_at?: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Requested",
  under_review: "Under review",
  approved: "Approved",
  paid_manually: "Paid manually",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const TABS = [
  "pending",
  "under_review",
  "approved",
  "paid_manually",
  "rejected",
  "cancelled",
  "all",
] as const;

export default function AdminWithdrawals() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<(typeof TABS)[number]>("pending");
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await request<{ payouts?: PayoutRow[] }>(
      `/api/admin/payouts?status=${encodeURIComponent(status)}`,
    );
    if (error) {
      showToast(error.message || "Failed to load payouts");
      setRows([]);
    } else {
      setRows(Array.isArray(data?.payouts) ? data.payouts : []);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (
    id: string,
    action: "review" | "approve" | "reject" | "mark-paid" | "cancel",
  ) => {
    if (
      (action === "reject" || action === "cancel") &&
      !note.trim()
    ) {
      showToast("Note/reason required");
      return;
    }
    setBusyId(id);
    const { error } = await request(`/api/admin/payout/${id}/${action}`, {
      method: "POST",
      body: JSON.stringify({ admin_note: note.trim() || undefined }),
    });
    setBusyId(null);
    if (error) {
      showToast(error.message || "Action failed");
      return;
    }
    setNote("");
    showToast("Updated");
    void load();
  };

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
          <Wallet className="w-7 h-7 text-[#C9A227]" />
          Withdrawals
        </h1>
        <p className="text-sm text-white/50 mb-4">
          Manual review only — no automated bank payout rail. Every status change
          records admin identity, timestamp, and note.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setStatus(t)}
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                status === t
                  ? "bg-[#C9A227] text-black"
                  : "bg-white/10 text-white/70"
              }`}
            >
              {t === "all" ? "All" : STATUS_LABEL[t] || t}
            </button>
          ))}
        </div>

        <label className="block text-xs text-white/50 mb-1">
          Admin note / reason (required for reject & cancel)
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full mb-4 bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-sm"
          placeholder="Reason or payment reference"
        />

        {loading ? (
          <p className="text-white/50">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-white/40 text-sm">No payouts in this status.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((p) => (
              <li
                key={p.id}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="flex flex-wrap justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold">
                      {p.display_name || p.username || p.user_id}
                    </p>
                    <p className="text-xs text-white/40">{p.id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#C9A227] font-bold tabular-nums">
                      {Number(p.coins_amount).toLocaleString()} coins
                    </p>
                    <p className="text-xs text-white/50">
                      {STATUS_LABEL[p.status] || p.status}
                    </p>
                  </div>
                </div>
                {p.processed_by && (
                  <p className="text-[11px] text-white/35 mb-2">
                    By {p.processed_by}
                    {p.processed_at
                      ? ` · ${new Date(p.processed_at).toLocaleString()}`
                      : ""}
                    {p.admin_note ? ` · ${p.admin_note}` : ""}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {p.status === "pending" && (
                    <>
                      <Btn
                        disabled={busyId === p.id}
                        onClick={() => void act(p.id, "review")}
                        label="Under review"
                      />
                      <Btn
                        disabled={busyId === p.id}
                        onClick={() => void act(p.id, "approve")}
                        label="Approve"
                      />
                      <Btn
                        disabled={busyId === p.id}
                        onClick={() => void act(p.id, "reject")}
                        label="Reject"
                      />
                      <Btn
                        disabled={busyId === p.id}
                        onClick={() => void act(p.id, "cancel")}
                        label="Cancel"
                      />
                    </>
                  )}
                  {p.status === "under_review" && (
                    <>
                      <Btn
                        disabled={busyId === p.id}
                        onClick={() => void act(p.id, "approve")}
                        label="Approve"
                      />
                      <Btn
                        disabled={busyId === p.id}
                        onClick={() => void act(p.id, "reject")}
                        label="Reject"
                      />
                      <Btn
                        disabled={busyId === p.id}
                        onClick={() => void act(p.id, "cancel")}
                        label="Cancel"
                      />
                    </>
                  )}
                  {p.status === "approved" && (
                    <Btn
                      disabled={busyId === p.id}
                      onClick={() => void act(p.id, "mark-paid")}
                      label="Mark paid manually"
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Btn({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/15 disabled:opacity-40"
    >
      {label}
    </button>
  );
}
