import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useUserStatus } from '../lib/useUserStatus';
import { useTheme } from '../lib/useTheme';
import HarvexLogo from './HarvexLogo';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';

function NavLink({ to, children, onClick, exact }: { to: string; children: React.ReactNode; onClick?: () => void; exact?: boolean }) {
  const { pathname } = useLocation();
  const active = exact ? pathname === to : pathname.startsWith(to);
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`text-sm font-medium transition ${active ? 'text-brand-yellow' : 'text-white/80 hover:text-white'}`}
    >
      {children}
    </Link>
  );
}

function GuideNavLink({ onClick }: { onClick?: () => void }) {
  const { pathname } = useLocation();
  const active = pathname.startsWith('/guide');
  return (
    <Link
      to="/guide"
      onClick={onClick}
      className={`flex items-center gap-2 text-sm font-medium transition ${active ? 'text-brand-yellow' : 'text-white/80 hover:text-white'}`}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-yellow/25 text-xs font-bold text-brand-yellow">?</span>
      Guide
    </Link>
  );
}

const ADMIN_LINKS = [
  { to: '/pending-products', label: 'Pending Products' },
  { to: '/admin/bids', label: 'All Bids' },
  { to: '/intelligence', label: 'Intelligence' },
  { to: '/spot-sales/admin', label: 'Clearance' },
  { to: '/iso/admin', label: 'ISO Board' },
  { to: '/coa-inbox', label: 'Supplies Inbox' },
  { to: '/shares', label: 'Shares' },
  { to: '/users', label: 'Users' },
];

function AdminDropdown() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isOnAdminPage = ADMIN_LINKS.some((l) => pathname.startsWith(l.to));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-sm font-medium transition ${isOnAdminPage ? 'text-brand-yellow' : 'text-white/80 hover:text-white'}`}
      >
        Admin
        <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 overflow-hidden rounded-lg border border-white/10 bg-brand-blue dark:bg-[#255564] shadow-xl">
          {ADMIN_LINKS.map((l) => {
            const active = pathname.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2 text-sm font-medium transition ${active ? 'bg-white/10 text-brand-yellow' : 'text-white/80 hover:bg-white/5 hover:text-white'}`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminMobileSection({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-sm font-medium text-white/80 transition hover:text-white"
      >
        Admin
        <svg className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {expanded && (
        <div className="ml-3 mt-1 flex flex-col gap-1 border-l border-white/15 pl-3">
          {ADMIN_LINKS.map((l) => {
            const active = pathname.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                onClick={onClose}
                className={`text-sm font-medium transition ${active ? 'text-brand-yellow' : 'text-white/80 hover:text-white'}`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserDropdown() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-brand-yellow text-sm font-bold text-brand-teal transition hover:ring-2 hover:ring-white/30"
        title={user?.email || 'Account'}
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-lg border border-white/10 bg-brand-blue dark:bg-[#255564] shadow-xl">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-sm font-medium text-white">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-white/50 truncate">{user?.email}</p>
          </div>
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="block w-full px-4 py-2.5 text-left text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
          >
            Settings
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              logout().then(() => navigate('/'));
            }}
            className="w-full cursor-pointer px-4 py-2.5 text-left text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data } = useUserStatus();
  const { resolved } = useTheme();
  const isTeal = resolved === 'teal';
  const isSeller = data?.user?.contactType?.includes('Seller') ?? false;
  const isAdmin = data?.user?.isAdmin ?? false;
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = (
    <>
      <NavLink to="/marketplace" onClick={() => setMobileOpen(false)}>Marketplace</NavLink>
      <NavLink to="/shortlist" onClick={() => setMobileOpen(false)}>Shortlist</NavLink>
      <NavLink to="/my-matches" onClick={() => setMobileOpen(false)}>My Matches</NavLink>
      {isSeller && <NavLink to="/my-listings" onClick={() => setMobileOpen(false)}>My Listings</NavLink>}
      <NavLink to="/orders" onClick={() => setMobileOpen(false)}>Orders</NavLink>
      <GuideNavLink onClick={() => setMobileOpen(false)} />
    </>
  );

  return (
    <div className={`min-h-screen ${isTeal ? 'bg-gradient-to-br from-brand-teal via-brand-blue/80 to-brand-teal' : 'surface-base'}`}>
      <header className="sticky top-0 z-30 bg-brand-blue dark:bg-[#255564] shadow-[0_4px_12px_rgba(0,0,0,0.25)]">
        <div>
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Link to="/marketplace">
              <HarvexLogo size="md-lg" color="white" className="translate-y-0.5" />
            </Link>
            <div className="flex items-center gap-5">
              <nav className="hidden items-center gap-5 sm:flex">
                {navLinks}
                {isAdmin && <AdminDropdown />}
              </nav>
              <div className="flex items-center gap-3">
                <ThemeToggle />
                <NotificationBell />
                <UserDropdown />
              </div>
              {/* Hamburger button — mobile only */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="rounded-lg p-2 text-white/70 hover:text-white sm:hidden"
                aria-label="Toggle menu"
              >
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  {mobileOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile slide-out drawer */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 sm:hidden"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed right-0 top-0 z-50 flex h-full w-64 flex-col surface shadow-xl transition-transform sm:hidden">
            <div className="flex items-center justify-between border-b border-default px-4 py-4">
              <HarvexLogo size="sm" color={resolved === 'light' ? 'dark' : 'white'} showText={false} />
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1 text-muted hover-surface-muted"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-4">
              {navLinks}
              {isAdmin && <AdminMobileSection onClose={() => setMobileOpen(false)} />}
            </nav>
          </div>
        </>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
