import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { fetchAdminUsers, approveUser, rejectUser, promoteUser, demoteUser, adminResetPassword, type AdminUser } from '../lib/api';

type FilterTab = 'pending' | 'approved' | 'all';

export default function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState<FilterTab>('pending');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchAdminUsers(filter);
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter]);

  async function handleApprove(userId: string) {
    setActionLoading(userId);
    try {
      await approveUser(userId);
      await load();
    } catch (err) {
      console.error('Failed to approve user:', err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(userId: string) {
    setActionLoading(userId);
    try {
      await rejectUser(userId);
      setConfirmReject(null);
      await load();
    } catch (err) {
      console.error('Failed to reject user:', err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePromote(userId: string, userName: string) {
    if (!confirm(`Grant admin access to ${userName}? They will be able to manage users, products, and all admin features.`)) return;
    setActionLoading(userId);
    try {
      await promoteUser(userId);
      await load();
    } catch (err) {
      console.error('Failed to promote user:', err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDemote(userId: string, userName: string) {
    if (!confirm(`Remove admin access from ${userName}?`)) return;
    setActionLoading(userId);
    try {
      await demoteUser(userId);
      await load();
    } catch (err) {
      console.error('Failed to demote user:', err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResetPassword(userId: string, userName: string) {
    if (!confirm(`Reset password for ${userName}? A temporary password will be generated.`)) return;
    setActionLoading(userId);
    try {
      const result = await adminResetPassword(userId);
      window.prompt(
        'Temporary password (copy it now — it will not be shown again):',
        result.temporaryPassword,
      );
    } catch (err) {
      console.error('Failed to reset password:', err);
      alert('Failed to reset password. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }

  function getOnboardingStatus(user: AdminUser) {
    if (!user.eulaAcceptedAt) return 'EULA Pending';
    if (!user.docUploaded) return 'Doc Pending';
    if (!user.approved) return 'Awaiting Approval';
    return 'Active';
  }

  function getStatusBadge(user: AdminUser) {
    const status = getOnboardingStatus(user);
    const colors: Record<string, string> = {
      'EULA Pending': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      'Doc Pending': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      'Awaiting Approval': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      'Active': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    };
    return (
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || ''}`}>
        {status}
      </span>
    );
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'pending', label: 'Pending Review' },
    { key: 'approved', label: 'Approved' },
    { key: 'all', label: 'All Users' },
  ];

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">User Management</h1>
        <div className="mt-1 h-0.5 w-12 bg-brand-yellow rounded" />
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              filter === tab.key
                ? 'bg-brand-teal text-white'
                : 'surface-muted text-secondary hover:text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-lg surface p-8 text-center text-muted shadow-sm">
          No users found for this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg surface shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default text-left text-xs font-medium uppercase tracking-wider text-muted">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Zoho</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {users.map((user) => (
                <tr key={user.id} className="hover:surface-muted transition">
                  <td className="px-4 py-3 font-medium text-primary">
                    {user.firstName || user.lastName
                      ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-secondary">{user.email}</td>
                  <td className="px-4 py-3 text-secondary">{user.companyName || '—'}</td>
                  <td className="px-4 py-3 text-secondary">{user.contactType || '—'}</td>
                  <td className="px-4 py-3">
                    {user.zohoLinked ? (
                      <span className="text-green-600 dark:text-green-400" title="Linked to Zoho CRM">Yes</span>
                    ) : (
                      <span className="text-muted">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {getStatusBadge(user)}
                      {user.isAdmin && (
                        <span className="inline-block rounded-full bg-brand-blue/15 px-2.5 py-0.5 text-xs font-medium text-brand-blue dark:bg-brand-blue/25">
                          Admin
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {!user.approved && (
                        <button
                          onClick={() => handleApprove(user.id)}
                          disabled={actionLoading === user.id}
                          className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition"
                        >
                          {actionLoading === user.id ? '...' : 'Approve'}
                        </button>
                      )}
                      {user.approved && (
                        user.isAdmin ? (
                          <button
                            onClick={() => handleDemote(user.id, user.firstName || user.email)}
                            disabled={actionLoading === user.id}
                            className="rounded bg-brand-blue/10 px-3 py-1 text-xs font-medium text-brand-blue hover:bg-brand-blue/20 disabled:opacity-50 transition"
                          >
                            {actionLoading === user.id ? '...' : 'Remove Admin'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePromote(user.id, user.firstName || user.email)}
                            disabled={actionLoading === user.id}
                            className="rounded bg-brand-teal/10 px-3 py-1 text-xs font-medium text-brand-teal hover:bg-brand-teal/20 disabled:opacity-50 transition"
                          >
                            {actionLoading === user.id ? '...' : 'Make Admin'}
                          </button>
                        )
                      )}
                      {user.approved && (
                        <button
                          onClick={() => handleResetPassword(user.id, user.firstName || user.email)}
                          disabled={actionLoading === user.id}
                          className="rounded bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50 transition"
                        >
                          {actionLoading === user.id ? '...' : 'Reset PW'}
                        </button>
                      )}
                      {confirmReject === user.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleReject(user.id)}
                            disabled={actionLoading === user.id}
                            className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmReject(null)}
                            className="rounded bg-gray-300 dark:bg-gray-600 px-2 py-1 text-xs font-medium text-primary transition"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmReject(user.id)}
                          className="rounded bg-red-100 dark:bg-red-900/30 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
