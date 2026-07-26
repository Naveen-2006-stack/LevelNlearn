import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', bounce: 0.3 }}
            className="relative z-10 bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl p-6 sm:p-8 w-full max-w-md border border-slate-200 dark:border-white/10"
          >
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl transition-colors"
            >
              <X size={20} />
            </button>
            
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${
              isDestructive 
                ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400'
                : 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
            }`}>
              <AlertTriangle size={28} />
            </div>

            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-3">
              {title}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
              {message}
            </p>

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                }}
                className={`flex-1 py-3 rounded-xl font-bold text-white shadow-lg transition-all ${
                  isDestructive
                    ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/30'
                    : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30'
                }`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
