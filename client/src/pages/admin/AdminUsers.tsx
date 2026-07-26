import { useState, useEffect } from 'react';
import { adminApi } from '../../api/client';
import { Trash2, Shield, Ghost } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { ConfirmModal } from '../../components/ConfirmModal';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useAuthStore();
  
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
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await adminApi.getUsers();
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleGhost = async (id: string, isGhost: boolean) => {
    try {
      await adminApi.toggleGhost(id, isGhost);
      loadUsers();
    } catch (err) {
      alert('Failed to toggle ghost mode');
    }
  };

  const handleDelete = async (id: string) => {
    if (id === currentUser?.id) {
      alert('You cannot delete yourself!');
      return;
    }
    
    setConfirmModal({
      isOpen: true,
      title: 'Delete User',
      message: 'Are you sure you want to permanently delete this user and ALL their quizzes and data? This cannot be undone.',
      action: async () => {
        try {
          await adminApi.deleteUser(id);
          loadUsers();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          alert('Failed to delete user');
        }
      }
    });
  };

  if (loading) return <div className="text-center py-10 animate-pulse text-slate-500">Loading users...</div>;

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
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">User Management</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
              <th className="pb-3 px-4 font-semibold">User</th>
              <th className="pb-3 px-4 font-semibold">Role</th>
              <th className="pb-3 px-4 font-semibold">Reg No</th>
              <th className="pb-3 px-4 font-semibold">Status</th>
              <th className="pb-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="py-4 px-4">
                  <div className="font-bold text-slate-900 dark:text-white">{u.name || 'Unknown'}</div>
                  <div className="text-sm text-slate-500">{u.email}</div>
                  <div className="text-xs text-slate-400 mt-1 font-mono">{u.id}</div>
                </td>
                <td className="py-4 px-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold ${
                    u.role === 'ADMIN' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' :
                    u.role === 'TEACHER' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400' :
                    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    {u.role === 'ADMIN' && <Shield size={12} />}
                    {u.role}
                  </span>
                </td>
                <td className="py-4 px-4">
                  <span className="text-sm font-mono text-slate-600 dark:text-slate-300">{u.regNo || 'N/A'}</span>
                </td>
                <td className="py-4 px-4">
                  {u.isGhost ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400">
                      <Ghost size={12} /> Ghost Mode
                    </span>
                  ) : (
                    <span className="text-slate-400 text-sm">Standard</span>
                  )}
                </td>
                <td className="py-4 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {u.role !== 'ADMIN' && (
                      <button
                        onClick={() => handleToggleGhost(u.id, !u.isGhost)}
                        aria-label={u.isGhost ? 'Disable ghost mode' : 'Enable ghost mode'}
                        className={`p-2 rounded-lg transition-colors ${
                          u.isGhost 
                            ? 'text-violet-600 bg-violet-50 hover:bg-violet-100 dark:bg-violet-500/10 dark:hover:bg-violet-500/20' 
                            : 'text-slate-400 hover:text-violet-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                        title="Toggle Ghost Mode"
                      >
                        <Ghost size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(u.id)}
                      disabled={u.id === currentUser?.id}
                      aria-label="Delete user"
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Delete User"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
