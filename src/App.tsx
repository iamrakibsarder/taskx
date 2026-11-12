import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import HomePage from '@/pages/HomePage';
import TasksPage from '@/pages/TasksPage';

// Less-used pages load on demand to keep the first load small.
const TimesheetPage = lazy(() => import('@/pages/TimesheetPage'));
const BillingPage = lazy(() => import('@/pages/BillingPage'));
const InvoicesPage = lazy(() => import('@/pages/InvoicesPage'));
const InvoiceDetailPage = lazy(() => import('@/pages/InvoiceDetailPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const ClientsPage = lazy(() => import('@/pages/ClientsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const ActivityPage = lazy(() => import('@/pages/ActivityPage'));
const TeamPage = lazy(() => import('@/pages/TeamPage'));

const wrap = (el: ReactNode) => <Suspense fallback={<div className="py-20 text-center text-faint">Loading…</div>}>{el}</Suspense>;

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="timesheet" element={wrap(<TimesheetPage />)} />
        <Route path="billing" element={wrap(<BillingPage />)} />
        <Route path="invoices" element={wrap(<InvoicesPage />)} />
        <Route path="invoices/:id" element={wrap(<InvoiceDetailPage />)} />
        <Route path="reports" element={wrap(<ReportsPage />)} />
        <Route path="clients" element={wrap(<ClientsPage />)} />
        <Route path="settings" element={wrap(<SettingsPage />)} />
        <Route path="activity" element={wrap(<ActivityPage />)} />
        <Route path="team" element={wrap(<TeamPage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
