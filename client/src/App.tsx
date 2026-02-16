import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { SignIn, SignUp, SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { useUserStatus } from './lib/useUserStatus';
import Landing from './pages/Landing';
import Marketplace from './pages/Marketplace';
import ProductDetail from './pages/ProductDetail';
import Onboarding from './pages/Onboarding';
import PendingApproval from './pages/PendingApproval';
import UserManagement from './pages/UserManagement';
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
import NotificationsPage from './pages/NotificationsPage';
import ShortlistPage from './pages/ShortlistPage';
import SpotSales from './pages/SpotSales';
import SpotSalesAdmin from './pages/SpotSalesAdmin';
import PendingProducts from './pages/PendingProducts';
import Guide from './pages/Guide';
import { ShortlistProvider } from './lib/useShortlist';

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
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
          <p className="text-muted">Loading your account...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md rounded-lg surface p-8 text-center shadow-lg">
          <h2 className="mb-2 text-xl font-semibold text-red-600">Something went wrong</h2>
          <p className="text-muted">{error}</p>
        </div>
      </div>
    );
  }

  switch (data?.status) {
    case 'NOT_FOUND':
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="max-w-md rounded-lg surface p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
            <p className="text-muted">Setting up your account... Please wait a moment and refresh.</p>
          </div>
        </div>
      );
    case 'PENDING_APPROVAL':
      return <Navigate to="/pending" replace />;
    case 'EULA_REQUIRED':
    case 'DOC_REQUIRED':
      return <Navigate to="/onboarding" replace />;
    case 'ACTIVE':
      return <>{children}</>;
    default:
      return <Navigate to="/onboarding" replace />;
  }
}

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center surface-base px-4">
      <div className="w-full max-w-md rounded-lg surface p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 text-6xl font-bold text-brand-teal/30">404</div>
        <h2 className="mb-2 text-xl font-semibold text-primary">Page not found</h2>
        <p className="mb-6 text-sm text-muted">The page you're looking for doesn't exist or has been moved.</p>
        <Link
          to="/"
          className="inline-block rounded-lg bg-brand-teal px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-blue"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ShortlistProvider>
    <div className="min-h-screen surface-base text-primary">
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/sign-in/*" element={<div className="flex min-h-screen items-center justify-center"><SignIn routing="path" path="/sign-in" /></div>} />
        <Route path="/sign-up/*" element={<div className="flex min-h-screen items-center justify-center"><SignUp routing="path" path="/sign-up" /></div>} />

        {/* Authenticated but pre-approval routes */}
        <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
        <Route path="/pending" element={<RequireAuth><PendingApproval /></RequireAuth>} />

        {/* Fully protected marketplace routes */}
        <Route path="/dashboard" element={<Navigate to="/marketplace" replace />} />
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
        <Route path="/shortlist" element={
          <RequireAuth><MarketplaceGuard><ShortlistPage /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/spot-sales" element={
          <RequireAuth><MarketplaceGuard><SpotSales /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/spot-sales/admin" element={
          <RequireAuth><MarketplaceGuard><SpotSalesAdmin /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/my-matches" element={
          <RequireAuth><MarketplaceGuard><BuyerMatchesPage /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/notifications" element={
          <RequireAuth><MarketplaceGuard><NotificationsPage /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/guide" element={
          <RequireAuth><MarketplaceGuard><Guide /></MarketplaceGuard></RequireAuth>
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
        <Route path="/pending-products" element={
          <RequireAuth><MarketplaceGuard><PendingProducts /></MarketplaceGuard></RequireAuth>
        } />
        <Route path="/users" element={
          <RequireAuth><MarketplaceGuard><UserManagement /></MarketplaceGuard></RequireAuth>
        } />

        {/* Public share routes (NO auth) */}
        <Route path="/share/:token" element={<ShareViewer />} />
        <Route path="/share/:token/product/:id" element={<SharedProductDetail />} />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
    </ShortlistProvider>
  );
}
