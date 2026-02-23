import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useUserStatus } from '../lib/useUserStatus';
import HarvexLogo from '../components/HarvexLogo';

export default function PendingApproval() {
  const { logout } = useAuth();
  const { data } = useUserStatus();
  const navigate = useNavigate();

  const isSeller = data?.user?.contactType?.includes('Seller') ?? false;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 dark:bg-slate-900 px-4">
      <div className="absolute right-6 top-6">
        <button
          onClick={() => logout().then(() => navigate('/'))}
          className="cursor-pointer rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-1.5 text-sm text-gray-500 dark:text-slate-400 transition hover:bg-gray-100 dark:hover:bg-slate-700"
        >
          Sign out
        </button>
      </div>

      <div className="w-full max-w-md overflow-hidden rounded-lg bg-white dark:bg-slate-800 text-center shadow-lg">
        <div className="bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue py-6">
          <HarvexLogo size="md" color="white" className="justify-center" />
        </div>
        <div className="p-8">
        {isSeller ? (
          <>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sage/20">
              <svg className="h-8 w-8 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            </div>

            <h2 className="mb-2 text-2xl font-semibold text-gray-900 dark:text-slate-100">
              One more step!
            </h2>
            <p className="mb-6 text-gray-500 dark:text-slate-400">
              To complete your seller setup, please contact us to receive your Seller's Agreement.
            </p>

            <a
              href="mailto:admin@gciscan.com?subject=Seller's Agreement Request"
              className="mb-6 inline-flex items-center gap-2 rounded-lg bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue px-6 py-3 font-semibold text-white shadow-sm transition hover:shadow-md"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
              Email admin@gciscan.com
            </a>

            <div className="rounded-lg bg-brand-sage/10 p-4 text-left text-sm text-gray-600 dark:text-slate-300">
              <p className="font-medium text-brand-teal">Next steps:</p>
              <ol className="mt-2 list-inside list-decimal space-y-1">
                <li>Request your Seller's Agreement via email</li>
                <li>Sign and return the agreement</li>
                <li>Our admin team reviews your application</li>
                <li>Your account is approved and activated</li>
              </ol>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
              <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>

            <h2 className="mb-2 text-2xl font-semibold text-gray-900 dark:text-slate-100">
              Thanks for completing your registration!
            </h2>
            <p className="mb-6 text-gray-500 dark:text-slate-400">
              Our team is reviewing your application. You'll receive an email once approved.
            </p>

            <div className="rounded-lg bg-brand-sage/10 p-4 text-left text-sm text-gray-600 dark:text-slate-300">
              <p className="font-medium text-brand-teal">What happens next?</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>Our team will review your application</li>
                <li>You'll receive an email once approved</li>
                <li>Once approved, you can start browsing the marketplace</li>
              </ul>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
