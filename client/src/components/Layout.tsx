import { UserButton } from '@clerk/clerk-react';
import { Link, useLocation } from 'react-router-dom';
import { useUserStatus } from '../lib/useUserStatus';

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const active = pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={`text-sm font-medium transition ${active ? 'text-brand-blue' : 'text-gray-600 hover:text-brand-blue'}`}
    >
      {children}
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data } = useUserStatus();
  const isSeller = data?.user?.contactType?.includes('Seller') ?? false;
  const isAdmin = isSeller; // Sellers have admin access (same as requireAdmin middleware)

  return (
    <div className="min-h-screen bg-brand-offwhite">
      <header className="sticky top-0 z-30 border-b border-brand-gray bg-white px-4 py-3 shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link to="/dashboard" className="text-xl font-bold text-brand-teal">
            GCIS Marketplace
          </Link>
          <div className="flex items-center gap-5">
            <nav className="hidden gap-5 sm:flex">
              <NavLink to="/marketplace">Marketplace</NavLink>
              <NavLink to="/my-matches">My Matches</NavLink>
              {isSeller && <NavLink to="/my-listings">My Listings</NavLink>}
              <NavLink to="/orders">Orders</NavLink>
              {isAdmin && <NavLink to="/intelligence">Intelligence</NavLink>}
              {isAdmin && <NavLink to="/coa-inbox">CoA Inbox</NavLink>}
              {isAdmin && <NavLink to="/shares">Shares</NavLink>}
            </nav>
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
