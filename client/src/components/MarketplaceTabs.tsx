import { Link, useLocation } from 'react-router-dom';

const TABS = [
  {
    to: '/marketplace',
    label: 'Products',
    icon: 'M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
    active: 'bg-brand-teal text-white shadow-sm',
    inactive: 'bg-brand-teal/10 text-brand-teal hover:bg-brand-teal/20 dark:bg-brand-sage/15 dark:text-brand-sage dark:hover:bg-brand-sage/25',
  },
  {
    to: '/spot-sales',
    label: 'Clearance',
    icon: 'M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z',
    active: 'bg-brand-coral text-white shadow-sm',
    inactive: 'bg-brand-coral/10 text-brand-coral hover:bg-brand-coral/20 dark:bg-brand-coral/15 dark:text-brand-coral dark:hover:bg-brand-coral/25',
  },
  {
    to: '/iso',
    label: 'Wanted',
    icon: 'm21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z',
    active: 'bg-brand-blue text-white shadow-sm',
    inactive: 'bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/20 dark:bg-brand-blue/15 dark:text-brand-blue dark:hover:bg-brand-blue/25',
  },
] as const;

export default function MarketplaceTabs() {
  const { pathname } = useLocation();

  return (
    <div className="mb-6 flex gap-2">
      {TABS.map((tab) => {
        const isActive = tab.to === '/marketplace'
          ? pathname === '/marketplace' || pathname.startsWith('/marketplace/')
          : pathname === tab.to;

        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              isActive ? tab.active : tab.inactive
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
