import { useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';

export default function Dashboard() {
  const { user } = useUser();

  return (
    <Layout>
      <h2 className="mb-6 text-2xl font-semibold text-gray-900">
        Welcome{user?.firstName ? `, ${user.firstName}` : ''}
      </h2>

      <div className="grid gap-6 md:grid-cols-3">
        <DashboardCard title="Browse Marketplace" description="Explore available cannabis products from licensed producers." href="/marketplace" />
        <DashboardCard title="My Orders" description="View your bid history and order statuses." href="/orders" />
        <DashboardCard title="Profile" description="Manage your account settings and preferences." href="/profile" />
      </div>
    </Layout>
  );
}

function DashboardCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <Link
      to={href}
      className="rounded-xl border bg-white p-6 shadow-sm transition hover:shadow-md"
    >
      <h3 className="mb-2 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500">{description}</p>
    </Link>
  );
}
