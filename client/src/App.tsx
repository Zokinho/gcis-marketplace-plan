import { Routes, Route, Navigate } from 'react-router-dom';
import { SignIn, SignUp, SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { useUserStatus } from './lib/useUserStatus';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Marketplace from './pages/Marketplace';
import ProductDetail from './pages/ProductDetail';
import Onboarding from './pages/Onboarding';
import PendingApproval from './pages/PendingApproval';
import NoZohoLink from './pages/NoZohoLink';
import MyListings from './pages/MyListings';
import CreateListing from './pages/CreateListing';
import Orders from './pages/Orders';
import CoaEmailQueue from './pages/CoaEmailQueue';
import CuratedShares from './pages/CuratedShares';
import ShareViewer from './pages/ShareViewer';
import SharedProductDetail from './pages/SharedProductDetail';
import IntelDashboard from './pages/IntelDashboard';
import MatchExplorer from './pages/MatchExplorer';
import PredictionsPage from './pages/PredictionsPage';
import ChurnPage from './pages/ChurnPage';
import MarketIntelPage from './pages/MarketIntelPage';
import SellerScorecardsPage from './pages/SellerScorecardsPage';
import TransactionsPage from './pages/TransactionsPage';
import BuyerMatchesPage from './pages/BuyerMatchesPage';

/**
 * Requires Clerk sign-in. Redirects unauthenticated users to /sign-in.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </>
  );
}

/**
 * Status-aware guard for marketplace routes.
 * Routes the user to the correct page based on their account state.
 */
function MarketplaceGuard({ children }: { children: React.ReactNode }) {
  const { data, loading, error } = useUserStatus();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
          <p className="text-gray-500">Loading your account...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <h2 className="mb-2 text-xl font-semibold text-red-600">Something went wrong</h2>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  switch (data?.status) {
    case 'NOT_FOUND':
    case 'NO_ZOHO_LINK':
      return <Navigate to="/no-access" replace />;
    case 'PENDING_APPROVAL':
      return <Navigate to="/pending" replace />;
    case 'EULA_REQUIRED':
    case 'DOC_REQUIRED':
      return <Navigate to="/onboarding" replace />;
    case 'ACTIVE':
      return <>{children}</>;
    default:
      return <Navigate to="/no-access" replace />;
  }
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/sign-in/*" element={<SignIn routing="path" path="/sign-in" />} />
        <Route path="/sign-up/*" element={<SignUp routing="path" path="/sign-up" />} />

        {/* Authenticated but pre-approval routes */}
        <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
        <Route path="/pending" element={<RequireAuth><PendingApproval /></RequireAuth>} />
        <Route path="/no-access" element={<RequireAuth><NoZohoLink /></RequireAuth>} />

        {/* Fully protected marketplace routes */}
        <Route path="/dashboard" element={
          <RequireAuth><MarketplaceGuard><Dashboard /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/marketplace" element={
          <RequireAuth><MarketplaceGuard><Marketplace /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/marketplace/:id" element={
          <RequireAuth><MarketplaceGuard><ProductDetail /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/my-listings" element={
          <RequireAuth><MarketplaceGuard><MyListings /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/create-listing" element={
          <RequireAuth><MarketplaceGuard><CreateListing /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/orders" element={
          <RequireAuth><MarketplaceGuard><Orders /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/my-matches" element={
          <RequireAuth><MarketplaceGuard><BuyerMatchesPage /></MarketplaceGuard></RequireAuth>
        } />

        {/* Intelligence routes (admin) */}
        <Route path="/intelligence" element={
          <RequireAuth><MarketplaceGuard><IntelDashboard /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/intelligence/matches" element={
          <RequireAuth><MarketplaceGuard><MatchExplorer /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/intelligence/predictions" element={
          <RequireAuth><MarketplaceGuard><PredictionsPage /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/intelligence/churn" element={
          <RequireAuth><MarketplaceGuard><ChurnPage /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/intelligence/market" element={
          <RequireAuth><MarketplaceGuard><MarketIntelPage /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/intelligence/sellers" element={
          <RequireAuth><MarketplaceGuard><SellerScorecardsPage /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/intelligence/transactions" element={
          <RequireAuth><MarketplaceGuard><TransactionsPage /></MarketplaceGuard></RequireAuth>
        } />

        {/* Admin routes (auth-guarded) */}
        <Route path="/coa-inbox" element={
          <RequireAuth><MarketplaceGuard><CoaEmailQueue /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/shares" element={
          <RequireAuth><MarketplaceGuard><CuratedShares /></MarketplaceGuard></RequireAuth>
        } />

        {/* Public share routes (NO auth) */}
        <Route path="/share/:token" element={<ShareViewer />} />
        <Route path="/share/:token/product/:id" element={<SharedProductDetail />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
