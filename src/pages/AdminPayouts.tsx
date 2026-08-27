import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Wallet } from 'lucide-react';
import { fetchAdminPayouts, updateAdminPayout, type PayoutRequest } from '../features/admin/adminApi';

export default function AdminPayouts() {
  const [requests, setRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchAdminPayouts().then(({ data }) => {
      if (data) setRequests(data.requests);
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const update = async (id: string, status: string) => {
    const { error } = await updateAdminPayout(id, status);
    if (error) return;
    load();
  };

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/admin" className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-fluid-xl font-bold">Admin — Payouts</h1>
      </header>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-white/60">No payout requests yet.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((request) => (
            <div key={request.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-1 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-green-300" />
                <span className="font-semibold text-white">£{request.amountGbp.toFixed(2)}</span>
                <span className="text-fluid-xs text-white/50">from {request.username}</span>
              </div>
              <p className="text-fluid-sm text-white/60">{request.displayName}</p>
              <p className="text-fluid-sm text-white/70">Status: <span className="capitalize text-white">{request.status}</span></p>
              <p className="text-fluid-xs text-white/40">{new Date(request.createdAt).toLocaleString()}</p>
              {request.status === 'pending' && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => update(request.id, 'approved')}
                    className="rounded-lg border border-green-500/50 px-3 py-1 text-fluid-xs text-green-300"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => update(request.id, 'rejected')}
                    className="rounded-lg border border-rose-500/50 px-3 py-1 text-fluid-xs text-rose-300"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
