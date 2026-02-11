import { UserButton } from '@clerk/clerk-react';

export default function PendingApproval() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="absolute right-6 top-6">
        <UserButton />
      </div>

      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>

        <h2 className="mb-2 text-2xl font-semibold text-gray-900">
          Thanks for signing up!
        </h2>
        <p className="mb-6 text-gray-500">
          Your account is being set up. We'll notify you when it's ready.
        </p>

        <div className="rounded-lg bg-gray-50 p-4 text-left text-sm text-gray-600">
          <p className="font-medium text-gray-700">What happens next?</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Our team will review your account</li>
            <li>You'll receive an email once approved</li>
            <li>Then you can complete onboarding and start browsing</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
