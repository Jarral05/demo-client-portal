import { Navigate, Route, Routes } from 'react-router';
import { useSession } from './session.jsx';
import { Layout, PublicPage } from './components/Layout.jsx';
import { Login } from './pages/Login.jsx';
import { Register } from './pages/Register.jsx';
import { VerifyEmail } from './pages/VerifyEmail.jsx';
import { Welcome } from './pages/Welcome.jsx';
import { Profile } from './pages/Profile.jsx';
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
import { isTeam } from '../../shared/roles.js';

export function App() {
  const { session } = useSession();
  if (!session) return <p className="loading" role="status">Loading…</p>;

  return (
    <Routes>
      {/* Links from the demo inbox work whether or not someone is signed in. */}
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/join" element={<AcceptInvite />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="*" element={session.user ? <SignedIn /> : <SignedOut />} />
    </Routes>
  );
}

function SignedOut() {
  return (
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/inbox" element={<PublicPage wide><Inbox signedOut /></PublicPage>} />
      <Route path="*" element={<Login />} />
    </Routes>
  );
}

// Which pages exist depends on the role. Hiding pages is only for tidiness:
// the server refuses anything a role isn't allowed, whatever the browser asks for.
function SignedIn() {
  const { session } = useSession();
  const { role } = session.user;
  const isCustomer = role === 'customer';
  return (
    <Layout>
      <Routes>
        <Route path="/" element={isCustomer ? <Welcome /> : <Overview />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/security" element={<Security />} />
        <Route path="/inbox" element={<Inbox />} />
        {!isCustomer && <Route path="/projects" element={<Projects />} />}
        {!isCustomer && <Route path="/projects/:id" element={<ProjectDetail />} />}
        {!isCustomer && <Route path="/invoices" element={<Invoices />} />}
        {role === 'client' && <Route path="/access-check" element={<AccessCheck />} />}
        {isTeam(role) && <Route path="/people" element={<People />} />}
        {isTeam(role) && <Route path="/activity" element={<ActivityLog />} />}
        {isTeam(role) && <Route path="/branding" element={<Branding />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
