import { Link } from 'react-router-dom';
import { SignedIn, SignedOut } from '@clerk/clerk-react';

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-green-900 to-green-700 text-white">
      <h1 className="mb-4 text-5xl font-bold">GCIS Marketplace</h1>
      <p className="mb-8 max-w-md text-center text-lg text-green-200">
        The B2B cannabis marketplace connecting licensed producers with international buyers.
      </p>

      <SignedOut>
        <div className="flex gap-4">
          <Link
            to="/sign-in"
            className="rounded-lg bg-white px-6 py-3 font-semibold text-green-900 transition hover:bg-green-100"
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
          className="rounded-lg bg-white px-6 py-3 font-semibold text-green-900 transition hover:bg-green-100"
        >
          Go to Dashboard
        </Link>
      </SignedIn>
    </div>
  );
}
