import { UserButton } from '@clerk/clerk-react';
import HarvexLogo from '../components/HarvexLogo';

export default function NoZohoLink() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="absolute right-6 top-6">
        <UserButton />
      </div>

      <div className="w-full max-w-md overflow-hidden rounded-lg bg-white text-center shadow-lg">
        <div className="bg-gradient-to-r from-brand-teal to-brand-blue py-6">
          <HarvexLogo size="md" color="white" className="justify-center" />
        </div>
        <div className="p-8">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sage/20">
          <svg className="h-8 w-8 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
        </div>

        <h2 className="mb-2 text-2xl font-semibold text-gray-900">
          Thanks for your interest!
        </h2>
        <p className="mb-6 text-gray-500">
          To get started with the Harvex, please reach out to our team and we'll get you set up.
        </p>

        <a
          href="mailto:team@gciscan.com"
          className="inline-block rounded-lg bg-gradient-to-r from-brand-teal to-brand-blue px-6 py-3 font-semibold text-white shadow-sm transition hover:shadow-md"
        >
          Contact team@gciscan.com
        </a>
        </div>
      </div>
    </div>
  );
}
