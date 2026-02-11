import { Link } from 'react-router-dom';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import HarvexLogo from '../components/HarvexLogo';

export default function Landing() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-brand-teal to-brand-blue text-white">
      {/* Decorative background blobs */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-24 h-[500px] w-[500px] rounded-full bg-brand-sage/10 blur-3xl" />
      <div className="pointer-events-none absolute right-1/4 top-1/4 h-64 w-64 rounded-full bg-brand-blue/20 blur-2xl" />

      <HarvexLogo size="xl" color="white" className="mb-4" />
      <p className="mb-8 max-w-md text-center text-lg text-white/70">
        The B2B cannabis marketplace connecting licensed producers with international buyers.
      </p>

      <SignedOut>
        <div className="flex gap-4">
          <Link
            to="/sign-in"
            className="rounded-lg bg-white px-6 py-3 font-semibold text-brand-teal transition hover:bg-brand-sage/20"
          >
            Sign In
          </Link>
          <Link
            to="/sign-up"
            className="rounded-lg border-2 border-white px-6 py-3 font-semibold text-white transition hover:bg-white/10"
          >
            Sign Up
          </Link>
        </div>
      </SignedOut>

      <SignedIn>
        <Link
          to="/dashboard"
          className="rounded-lg bg-white px-6 py-3 font-semibold text-brand-teal transition hover:bg-brand-sage/20"
        >
          Go to Dashboard
        </Link>
      </SignedIn>
    </div>
  );
}
