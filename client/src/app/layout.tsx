import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { post } from '../lib/api';
import { Toasts } from '../components/ui';
import { AssistantWidget } from '../components/assistant';

export function Layout() {
  const { user, clear } = useAuth();
  const navigate = useNavigate();

  async function logout() {
    try {
      await post('/auth/logout');
    } catch {
      // session already dead server-side — clearing locally is all that matters
    }
    clear();
    navigate('/');
  }

  const navLink = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
      isActive ? 'bg-mint/20 text-mint' : 'text-mint/70 hover:text-mint'
    }`;

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2"
      >
        Skip to content
      </a>
      <header className="bg-pitch">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="font-display text-2xl uppercase tracking-wide text-paper">
            Court<span className="text-accent">Book</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <NavLink to="/venues" className={navLink}>
              Find courts
            </NavLink>
            {user ? (
              <>
                <NavLink to="/me/bookings" className={navLink}>
                  My bookings
                </NavLink>
                {user.role === 'owner' && (
                  <NavLink to="/owner" className={navLink}>
                    Owner
                  </NavLink>
                )}
                <span className="hidden px-2 text-sm text-mint/60 sm:inline">{user.name}</span>
                <button
                  onClick={logout}
                  className="rounded-full px-3 py-1.5 text-sm font-semibold text-mint/70 hover:text-mint"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/auth/login" className={navLink}>
                  Log in
                </NavLink>
                <NavLink
                  to="/auth/register"
                  className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-deep"
                >
                  Sign up
                </NavLink>
              </>
            )}
          </div>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="bg-pitch-deep py-6 text-center text-xs text-mint/50">
        CourtBook — futsal courts in Kathmandu · times in Nepal Time (UTC+5:45)
      </footer>
      <Toasts />
      <AssistantWidget />
    </div>
  );
}
