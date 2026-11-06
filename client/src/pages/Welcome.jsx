import { Link } from 'react-router';
import { useSession } from '../session.jsx';
import { PageTitle } from '../components/ui.jsx';

// What a new customer sees: no client's work yet, and how to get it.
export function Welcome() {
  const { session } = useSession();
  return (
    <>
      <PageTitle title={`Welcome, ${session.user.name}`} intro="Your account is ready." />
      <section className="card narrow stack-small">
        <h2>Waiting for access</h2>
        <p>
          Your account is a <strong>Customer</strong> account. It can't see any client's projects yet.
          An admin at {session.brand.name} gives access to the right company.
        </p>
        <p className="muted">
          <strong>In this demo:</strong> sign out, sign in as <strong>Lena Brooks (Admin)</strong>, open
          {' '}<strong>People</strong>, and change your role to Client. Then sign back in as yourself.
        </p>
      </section>
      <section className="card narrow stack-small">
        <h2>While you wait</h2>
        <p><Link to="/profile">Check your details or change your password</Link></p>
        <p><Link to="/security">Turn on two-step sign-in</Link></p>
      </section>
    </>
  );
}
