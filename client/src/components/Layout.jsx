import { NavLink, useNavigate } from 'react-router';
import {
  FolderKanban, LayoutDashboard, LogOut, Palette, ReceiptText, ScrollText, ShieldCheck,
} from 'lucide-react';
import { useSession } from '../session.jsx';
import { STUDIO_URL } from '../links.js';

const CLIENT_LINKS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/invoices', label: 'Invoices', icon: ReceiptText },
  { to: '/access-check', label: 'Access check', icon: ShieldCheck },
];
const STAFF_LINKS = [
  { to: '/activity', label: 'Activity log', icon: ScrollText },
  { to: '/branding', label: 'Branding', icon: Palette },
];

export function DemoBar() {
  return (
    <div className="demobar">
      <span><strong>Demo.</strong> All data is made up, and your copy is deleted after 2 hours. Please don't enter real information.</span>
      <a href={STUDIO_URL}>Built by Jarral Digital</a>
    </div>
  );
}

export function Layout({ children }) {
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  const { user, brand } = session;
  const links = user.role === 'staff' ? [...CLIENT_LINKS, ...STAFF_LINKS] : CLIENT_LINKS;

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
            <div className="sidebar-user-org">{user.clientName ?? `${brand.name} staff`}</div>
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
