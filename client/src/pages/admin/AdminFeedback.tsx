import { useState, useEffect } from 'react';
import { adminApi } from '../../api/client';
import { Trash2, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { ConfirmModal } from '../../components/ConfirmModal';

export default function AdminFeedback() {
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
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
    loadFeedback();
  }, []);

  const loadFeedback = async () => {
    try {
      const res = await adminApi.getFeedback();
      setFeedbacks(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Feedback',
      message: 'Are you sure you want to permanently delete this feedback entry? This action cannot be undone.',
      action: async () => {
        try {
          await adminApi.deleteFeedback(id);
          loadFeedback();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          alert('Failed to delete feedback');
        }
      }
    });
  };

  if (loading) return <div className="text-center py-10 animate-pulse text-slate-500">Loading feedback...</div>;

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
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">User Feedback</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {feedbacks.map((f, i) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="bg-gray-50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-100 dark:border-white/5 relative group"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">{f.name}</div>
                <div className="text-xs text-slate-500">{f.email}</div>
              </div>
              <div className="flex text-amber-400">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Star key={idx} size={16} className={idx < f.rating ? 'fill-amber-400' : 'text-slate-300 dark:text-slate-600'} />
                ))}
              </div>
            </div>
            
            <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{f.message}</p>
            
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/5 flex justify-between items-center">
              <span className="text-xs text-slate-400">{new Date(f.createdAt).toLocaleDateString()}</span>
              
              <button
                onClick={() => handleDelete(f.id)}
                className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all"
                title="Delete/Resolve"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </motion.div>
        ))}
        {feedbacks.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500">
            No feedback received yet.
          </div>
        )}
      </div>
    </div>
    </>
  );
}
