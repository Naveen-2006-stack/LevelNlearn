import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, MonitorPlay, MessageSquare } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export default function AdminLayout() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role !== 'ADMIN') {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const navItems = [
    { name: 'Metrics Dashboard', path: '/admin', icon: <LayoutDashboard size={20} />, exact: true },
    { name: 'User Management', path: '/admin/users', icon: <Users size={20} /> },
    { name: 'Session Management', path: '/admin/sessions', icon: <MonitorPlay size={20} /> },
    { name: 'User Feedback', path: '/admin/feedback', icon: <MessageSquare size={20} /> },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Admin Control Panel</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage users, sessions, and platform feedback.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <div className="lg:w-64 shrink-0">
          <nav className="flex lg:flex-col gap-2 overflow-x-auto pb-4 lg:pb-0">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`
                }
              >
                {item.icon}
                {item.name}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/50 dark:border-white/5">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
