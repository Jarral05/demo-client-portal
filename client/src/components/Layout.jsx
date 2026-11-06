import { NavLink, useNavigate } from 'react-router';
import {
  CircleUser, FolderKanban, House, Inbox, KeyRound, LayoutDashboard, LogOut, Palette, ReceiptText, ScrollText,
  ShieldCheck, Users,
} from 'lucide-react';
import { useSession } from '../session.jsx';
import { STUDIO_URL } from '../links.js';
import { ROLES } from '../../../shared/roles.js';

const WORK = [
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/invoices', label: 'Invoices', icon: ReceiptText },
];
const TEAM = [
  { to: '/people', label: 'People', icon: Users },
  { to: '/activity', label: 'Activity log', icon: ScrollText },
  { to: '/branding', label: 'Branding', icon: Palette },
];
const MINE = [
  { to: '/profile', label: 'Profile', icon: CircleUser },
  { to: '/security', label: 'Security', icon: KeyRound },
  { to: '/inbox', label: 'Demo inbox', icon: Inbox },
];

// The menu for each role. It only decides what's shown; the server decides what's allowed.
function linksFor(role) {
  if (role === 'customer') return [{ to: '/', label: 'Welcome', icon: House, end: true }, ...MINE];
  const home = { to: '/', label: 'Overview', icon: LayoutDashboard, end: true };
  if (role === 'client') return [home, ...WORK, { to: '/access-check', label: 'Access check', icon: ShieldCheck }, ...MINE];
  return [home, ...WORK, ...TEAM, ...MINE];
}

export function DemoBar() {
  return (
    <div className="demobar">
      <span><strong>Demo.</strong> All data is made up, and your copy is deleted after 2 hours. Please don't enter real information.</span>
      <a href={STUDIO_URL}>Built by Jarral Digital</a>
    </div>
  );
}

// For pages that work signed in or out: password reset, invitations, the inbox.
export function PublicPage({ children, wide = false }) {
  return (
    <>
      <DemoBar />
      <main className={`public-page${wide ? ' public-page-wide' : ''}`}>{children}</main>
    </>
  );
}

export function Layout({ children }) {
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  const { user, brand } = session;
  const links = linksFor(user.role);

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  return (
    <>
      <DemoBar />
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-brand">{brand.name}</div>
          <nav aria-label="Main">
            {links.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}>
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-user">
            <div className="sidebar-user-name">{user.name}</div>
            <div className="sidebar-user-org">{user.clientName ?? `${ROLES[user.role].label}, ${brand.name}`}</div>
            <button type="button" className="link-button" onClick={handleSignOut}>
              <LogOut size={15} aria-hidden="true" /> Sign out or switch
            </button>
          </div>
        </aside>
        <main className="content">{children}</main>
      </div>
    </>
  );
}
