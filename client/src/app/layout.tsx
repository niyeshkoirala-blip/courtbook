import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { post } from '../lib/api';
import { Toasts } from '../components/ui';
import { AssistantWidget } from '../components/assistant';
import { Bg3d } from '../components/fx';

export function Layout() {
  const { user, clear } = useAuth();
  const navigate = useNavigate();
  const isOperator = user?.role === 'owner' || user?.role === 'admin';

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
    `rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
      isActive ? 'bg-turf/15 text-turf' : 'text-mint/70 hover:bg-white/5 hover:text-mint'
    }`;

  return (
    <div className="flex min-h-screen flex-col">
      <Bg3d />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-2 focus:text-ink"
      >
        Skip to content
      </a>
      <header className="cb-glass sticky top-0 z-40 border-x-0 border-t-0">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="group font-display text-2xl font-bold tracking-tight text-ink">
            Court
            <span className="text-turf transition-colors group-hover:text-accent">Book</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {/* Operators (owner/admin) run the platform — they don't get the player booking panel. */}
            {!isOperator && (
              <NavLink to="/venues" className={navLink}>
                Find courts
              </NavLink>
            )}
            {user ? (
              <>
                {!isOperator && (
                  <NavLink to="/me/bookings" className={navLink}>
                    My bookings
                  </NavLink>
                )}
                {user.role === 'owner' && (
                  <NavLink to="/owner" className={navLink}>
                    Owner
                  </NavLink>
                )}
                {user.role === 'admin' && (
                  <NavLink to="/admin" className={navLink}>
                    Admin
                  </NavLink>
                )}
                <span className="hidden px-2 text-sm text-sage sm:inline">{user.name}</span>
                <button
                  onClick={logout}
                  className="rounded-lg px-3.5 py-1.5 text-sm font-semibold text-mint/70 transition-colors hover:bg-white/5 hover:text-mint"
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
                  className="cb-sheen ml-1 rounded-lg bg-accent px-4 py-1.5 text-sm font-bold text-paper shadow-lg shadow-accent/25 transition-all hover:bg-accent-deep hover:shadow-accent/40"
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

      <footer className="mt-16 border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-8 text-center">
          <span className="font-display text-lg font-bold text-ink/80">
            Court<span className="text-turf">Book</span>
          </span>
          <p className="text-xs text-sage">
            Futsal courts in Kathmandu · times in Nepal Time (UTC+5:45)
          </p>
        </div>
      </footer>
      <Toasts />
      <AssistantWidget />
    </div>
  );
}
