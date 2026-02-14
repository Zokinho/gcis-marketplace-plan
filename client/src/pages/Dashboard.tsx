import { useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';

const CARDS = [
  {
    title: 'Browse Marketplace',
    description: 'Explore available cannabis products from licensed producers.',
    href: '/marketplace',
    accentColor: 'border-l-brand-teal',
    icon: (
      <svg className="h-6 w-6 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
      </svg>
    ),
  },
  {
    title: 'My Shortlist',
    description: 'Products you\'ve saved for quick access and price alerts.',
    href: '/shortlist',
    accentColor: 'border-l-brand-yellow',
    icon: (
      <svg className="h-6 w-6 text-brand-yellow" viewBox="0 0 24 24" fill="currentColor">
        <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0 1 11.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 0 1-1.085.67L12 18.089l-7.165 3.583A.75.75 0 0 1 3.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    title: 'My Orders',
    description: 'View your bid history and order statuses.',
    href: '/orders',
    accentColor: 'border-l-brand-blue',
    icon: (
      <svg className="h-6 w-6 text-brand-blue" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
      </svg>
    ),
  },
  {
    title: 'Profile',
    description: 'Manage your account settings and preferences.',
    href: '/profile',
    accentColor: 'border-l-brand-sage',
    icon: (
      <svg className="h-6 w-6 text-brand-sage" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
  },
  {
    title: 'Platform Guide',
    description: 'Learn how to browse products, place bids, and manage your account.',
    href: '/guide',
    accentColor: 'border-l-brand-coral',
    icon: (
      <svg className="h-6 w-6 text-brand-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
      </svg>
    ),
  },
];

export default function Dashboard() {
  const { user } = useUser();

  return (
    <Layout>
      {/* Welcome banner */}
      <div className="mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-primary">
            Welcome{user?.firstName ? `, ${user.firstName}` : ''}
          </h2>
          <p className="text-sm text-muted">
            Your Harvex dashboard — browse products, manage orders, and track your activity.
          </p>
          <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-teal to-brand-blue" />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((card) => (
          <DashboardCard key={card.href} {...card} />
        ))}
      </div>
    </Layout>
  );
}

function DashboardCard({
  title,
  description,
  href,
  accentColor,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  accentColor: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={href}
      className={`rounded-lg border border-brand-blue/15 border-l-4 ${accentColor} bg-brand-blue/5 p-6 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg`}
    >
      <div className="mb-3">{icon}</div>
      <h3 className="mb-2 text-lg font-semibold text-primary">{title}</h3>
      <p className="text-sm text-muted">{description}</p>
    </Link>
  );
}
