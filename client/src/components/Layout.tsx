import { useState } from 'react';
import { UserButton } from '@clerk/clerk-react';
import { Link, useLocation } from 'react-router-dom';
import { useUserStatus } from '../lib/useUserStatus';
import { useTheme } from '../lib/useTheme';
import HarvexLogo from './HarvexLogo';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';

function NavLink({ to, children, onClick }: { to: string; children: React.ReactNode; onClick?: () => void }) {
  const { pathname } = useLocation();
  const active = pathname.startsWith(to);
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

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data } = useUserStatus();
  const { resolved } = useTheme();
  const isSeller = data?.user?.contactType?.includes('Seller') ?? false;
  const isAdmin = data?.user?.isAdmin ?? false;
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = (
    <>
      <NavLink to="/marketplace" onClick={() => setMobileOpen(false)}>Marketplace</NavLink>
      <NavLink to="/my-matches" onClick={() => setMobileOpen(false)}>My Matches</NavLink>
      {isSeller && <NavLink to="/my-listings" onClick={() => setMobileOpen(false)}>My Listings</NavLink>}
      <NavLink to="/orders" onClick={() => setMobileOpen(false)}>Orders</NavLink>
      {isAdmin && <NavLink to="/intelligence" onClick={() => setMobileOpen(false)}>Intelligence</NavLink>}
      {isAdmin && <NavLink to="/coa-inbox" onClick={() => setMobileOpen(false)}>CoA Inbox</NavLink>}
      {isAdmin && <NavLink to="/shares" onClick={() => setMobileOpen(false)}>Shares</NavLink>}
      {isAdmin && <NavLink to="/users" onClick={() => setMobileOpen(false)}>Users</NavLink>}
    </>
  );

  return (
    <div className="min-h-screen surface-base">
      <header className="sticky top-0 z-30 bg-brand-blue dark:bg-[#255564] shadow-sm">
        <div className="border-b border-white/10">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Link to="/dashboard">
              <HarvexLogo size="sm" color="white" />
            </Link>
            <div className="flex items-center gap-5">
              <nav className="hidden gap-5 sm:flex">
                {navLinks}
              </nav>
              <ThemeToggle />
              <NotificationBell />
              <UserButton />
              {/* Hamburger button — mobile only */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="rounded-lg p-1.5 text-white/70 hover:text-white sm:hidden"
                aria-label="Toggle menu"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
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
        {/* Gradient accent line */}
        <div className="h-0.5 bg-gradient-to-r from-brand-teal to-brand-blue" />
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
              <HarvexLogo size="sm" color={resolved === 'dark' ? 'white' : 'dark'} showText={false} />
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
            </nav>
          </div>
        </>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
