import { UserButton } from '@clerk/clerk-react';
import HarvexLogo from '../components/HarvexLogo';

export default function PendingApproval() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center surface-base px-4">
      <div className="absolute right-6 top-6">
        <UserButton />
      </div>

      <div className="w-full max-w-md overflow-hidden rounded-lg surface text-center shadow-lg">
        <div className="bg-brand-blue dark:bg-gradient-to-r dark:from-brand-teal dark:to-brand-blue py-6">
          <HarvexLogo size="md" color="white" className="justify-center" />
        </div>
        <div className="p-8">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
          <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>

        <h2 className="mb-2 text-2xl font-semibold text-primary">
          Thanks for completing your registration!
        </h2>
        <p className="mb-6 text-muted">
          Our team is reviewing your application. You'll receive an email once approved.
        </p>

        <div className="rounded-lg bg-brand-sage/10 p-4 text-left text-sm text-secondary">
          <p className="font-medium text-brand-teal">What happens next?</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Our team will review your application</li>
            <li>You'll receive an email once approved</li>
            <li>Once approved, you can start browsing the marketplace</li>
          </ul>
        </div>
        </div>
      </div>
    </div>
  );
}
