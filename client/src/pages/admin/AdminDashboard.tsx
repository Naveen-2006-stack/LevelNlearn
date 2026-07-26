import { useState, useEffect } from 'react';
import { adminApi } from '../../api/client';
import { Users, MonitorPlay, FileQuestion } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState({ totalUsers: 0, activeSessions: 0, totalQuizzes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getMetrics()
      .then(res => setMetrics(res.data))
      .catch(err => console.error('Failed to load metrics', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-10 animate-pulse text-slate-500">Loading metrics...</div>;

  const statCards = [
    { label: 'Total Registered Users', value: metrics.totalUsers, icon: <Users size={24} />, color: 'from-blue-500 to-indigo-600' },
    { label: 'Active Live Sessions', value: metrics.activeSessions, icon: <MonitorPlay size={24} />, color: 'from-emerald-400 to-teal-500' },
    { label: 'Total Quizzes Created', value: metrics.totalQuizzes, icon: <FileQuestion size={24} />, color: 'from-amber-400 to-orange-500' },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Platform Overview</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCards.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`bg-gradient-to-br ${stat.color} rounded-2xl p-6 text-white shadow-lg`}
          >
            <div className="flex justify-between items-start mb-4 opacity-80">
              <span className="font-semibold text-sm uppercase tracking-wider">{stat.label}</span>
              {stat.icon}
            </div>
            <div className="text-5xl font-black">{stat.value}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
