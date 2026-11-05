import { Navigate, Route, Routes } from 'react-router';
import { useSession } from './session.jsx';
import { Layout } from './components/Layout.jsx';
import { Login } from './pages/Login.jsx';
import { Overview } from './pages/Overview.jsx';
import { Projects } from './pages/Projects.jsx';
import { ProjectDetail } from './pages/ProjectDetail.jsx';
import { Invoices } from './pages/Invoices.jsx';
import { AccessCheck } from './pages/AccessCheck.jsx';
import { ActivityLog } from './pages/ActivityLog.jsx';
import { Branding } from './pages/Branding.jsx';

export function App() {
  const { session } = useSession();
  if (!session) return <p className="loading" role="status">Loading…</p>;
  if (!session.user) return <Login />;

  const isStaff = session.user.role === 'staff';
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/access-check" element={<AccessCheck />} />
        {isStaff && <Route path="/activity" element={<ActivityLog />} />}
        {isStaff && <Route path="/branding" element={<Branding />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
