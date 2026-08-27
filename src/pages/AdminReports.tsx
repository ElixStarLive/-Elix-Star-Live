import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Flag } from 'lucide-react';
import { fetchAdminReports, type AdminReport } from '../features/admin/adminApi';

export default function AdminReports() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAdminReports().then(({ data }) => {
      if (cancelled) return;
      if (data) setReports(data.reports);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/admin" className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-fluid-xl font-bold">Admin — Reports</h1>
      </header>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="text-white/60">No reports yet.</p>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <div key={report.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-1 flex items-center gap-2">
                <Flag className="h-4 w-4 text-rose-300" />
                <span className="font-semibold text-white">{report.reason}</span>
              </div>
              <p className="text-fluid-sm text-white/70">
                {report.targetType} <span className="font-mono text-white/50">{report.targetId}</span>
              </p>
              <p className="text-fluid-sm text-white/70">Status: <span className="capitalize text-white">{report.status}</span></p>
              <p className="text-fluid-xs text-white/40">{new Date(report.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
