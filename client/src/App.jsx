import { Navigate, Route, Routes } from 'react-router';
import { useSession } from './session.jsx';
import { Layout, PublicPage } from './components/Layout.jsx';
import { Login } from './pages/Login.jsx';
import { Overview } from './pages/Overview.jsx';
import { Projects } from './pages/Projects.jsx';
import { ProjectDetail } from './pages/ProjectDetail.jsx';
import { Invoices } from './pages/Invoices.jsx';
import { AccessCheck } from './pages/AccessCheck.jsx';
import { ActivityLog } from './pages/ActivityLog.jsx';
import { Branding } from './pages/Branding.jsx';
import { ForgotPassword, ResetPassword } from './pages/PasswordReset.jsx';
import { AcceptInvite } from './pages/AcceptInvite.jsx';
import { Inbox } from './pages/Inbox.jsx';
import { Security } from './pages/Security.jsx';
import { People } from './pages/People.jsx';

export function App() {
  const { session } = useSession();
  if (!session) return <p className="loading" role="status">Loading…</p>;

  return (
    <Routes>
      {/* Links from the demo inbox work whether or not someone is signed in. */}
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/join" element={<AcceptInvite />} />
      <Route path="*" element={session.user ? <SignedIn /> : <SignedOut />} />
    </Routes>
  );
}

function SignedOut() {
  return (
    <Routes>
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/inbox" element={<PublicPage wide><Inbox signedOut /></PublicPage>} />
      <Route path="*" element={<Login />} />
    </Routes>
  );
}

function SignedIn() {
  const { session } = useSession();
  const isStaff = session.user.role === 'staff';
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/access-check" element={<AccessCheck />} />
        <Route path="/security" element={<Security />} />
        <Route path="/inbox" element={<Inbox />} />
        {isStaff && <Route path="/people" element={<People />} />}
        {isStaff && <Route path="/activity" element={<ActivityLog />} />}
        {isStaff && <Route path="/branding" element={<Branding />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
