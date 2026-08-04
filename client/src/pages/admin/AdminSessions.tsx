import { useState, useEffect } from 'react';
import { adminApi } from '../../api/client';
import { Trash2, StopCircle, ArrowRight, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ConfirmModal } from '../../components/ConfirmModal';

export default function AdminSessions() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: () => {}
  });

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const res = await adminApi.getSessions();
      setSessions(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleForceEnd = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Force End Session',
      message: 'Are you sure you want to forcibly end this live session? All players will be disconnected.',
      action: async () => {
        try {
          await adminApi.forceEndSession(id);
          loadSessions();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          alert('Failed to force end session');
        }
      }
    });
  };

  const handleDelete = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Session',
      message: 'Are you sure you want to permanently delete this session and all its data? This cannot be undone.',
      action: async () => {
        try {
          await adminApi.deleteSession(id);
          loadSessions();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          alert('Failed to delete session');
        }
      }
    });
  };

  const handleDownloadReport = async (id: string) => {
    try {
      const res = await adminApi.getExcelReport(id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `session-${id}-report.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download session report');
    }
  };

  if (loading) return <div className="text-center py-10 animate-pulse text-slate-500">Loading sessions...</div>;

  return (
    <>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Session Management</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
              <th className="pb-3 px-4 font-semibold">Quiz</th>
              <th className="pb-3 px-4 font-semibold">Host</th>
              <th className="pb-3 px-4 font-semibold">Status</th>
              <th className="pb-3 px-4 font-semibold">Started</th>
              <th className="pb-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="py-4 px-4">
                  <div className="font-bold text-slate-900 dark:text-white">{s.quizTitle}</div>
                  <div className="text-xs text-slate-400 mt-1">Code: {s.joinCode}</div>
                </td>
                <td className="py-4 px-4 text-slate-700 dark:text-slate-300">
                  {s.hostName}
                </td>
                <td className="py-4 px-4">
                  <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-bold ${
                    s.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                    s.status === 'WAITING' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    {s.status}
                  </span>
                </td>
                <td className="py-4 px-4 text-sm text-slate-500">
                  {s.startedAt ? new Date(s.startedAt).toLocaleString() : 'Not started'}
                </td>
                <td className="py-4 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {s.status !== 'FINISHED' && (
                      <button
                        onClick={() => handleForceEnd(s.id)}
                        className="p-2 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-colors"
                        title="Force End Session"
                      >
                        <StopCircle size={18} />
                      </button>
                    )}
                    {s.status === 'FINISHED' && (
                      <Link
                        to={`/dashboard/reports/${s.id}`}
                        className="p-2 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors inline-block"
                        title="View Report"
                      >
                        <ArrowRight size={18} />
                      </Link>
                    )}
                    <button
                      onClick={() => handleDownloadReport(s.id)}
                      className="p-2 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-colors"
                      title="Download Report"
                    >
                      <Download size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Delete Session"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">No sessions found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
