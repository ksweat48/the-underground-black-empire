import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/domains/identity/auth-context';
import { ProtectedRoute } from '@/shared/components/protected-route';
import { NotFoundPage } from '@/shared/components/not-found-page';
import { CreateSheetProvider } from '@/shared/components/create-sheet';

const LandingPage = lazy(() => import('@/domains/founder-campaign/pages/landing-page'));
const AuthPage = lazy(() => import('@/domains/founder-campaign/pages/auth-page'));
const OnboardingCityPage = lazy(() => import('@/domains/founder-campaign/pages/onboarding-city-page'));
const OnboardingConfirmPage = lazy(() => import('@/domains/founder-campaign/pages/onboarding-confirm-page'));
const OnboardingAccountPage = lazy(() => import('@/domains/founder-campaign/pages/onboarding-account-page'));
const OnboardingIdentityPage = lazy(() => import('@/domains/founder-campaign/pages/onboarding-identity-page'));
const OnboardingWelcomePage = lazy(() => import('@/domains/founder-campaign/pages/onboarding-welcome-page'));
const EmpireDashboardPage = lazy(() => import('@/domains/founder-campaign/pages/empire-dashboard-page'));
const ProfilePage = lazy(() => import('@/domains/founder-campaign/pages/profile-page'));
const AdminPage = lazy(() => import('@/domains/admin/pages/admin-page'));
const MarketPage = lazy(() => import('@/domains/market/pages/market-page'));
const ListingDetailPage = lazy(() => import('@/domains/market/pages/listing-detail-page'));
const CreateListingPage = lazy(() => import('@/domains/market/pages/create-listing-page'));
const CreateUpdatePage = lazy(() => import('@/domains/market/pages/create-update-page'));
const CreateNewsPage = lazy(() => import('@/domains/market/pages/create-news-page'));
const CreateEventPage = lazy(() => import('@/domains/market/pages/create-event-page'));
const VotePage = lazy(() => import('@/domains/market/pages/vote-page'));
const MembershipPage = lazy(() => import('@/domains/membership/pages/membership-page'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950">
      <div className="w-8 h-8 rounded-full border-2 border-gold-500/30 border-t-gold-400 animate-spin" />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <CreateSheetProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<LandingRedirect />} />
              <Route path="/auth/sign-in" element={<AuthPage mode="sign-in" />} />
              <Route path="/auth/sign-up" element={<AuthPage mode="sign-up" />} />
              <Route path="/onboarding/city" element={<OnboardingCityPage />} />
              <Route path="/onboarding/confirm" element={<OnboardingConfirmPage />} />
              <Route path="/onboarding/account" element={<OnboardingAccountPage />} />
              <Route path="/onboarding/identity" element={<OnboardingIdentityPage />} />
              <Route path="/onboarding/welcome" element={<OnboardingWelcomePage />} />
              <Route
                path="/empire"
                element={
                  <ProtectedRoute>
                    <EmpireDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/market"
                element={
                  <ProtectedRoute>
                    <MarketPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/market/listing/:id"
                element={
                  <ProtectedRoute>
                    <ListingDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/market/create/listing"
                element={
                  <ProtectedRoute>
                    <CreateListingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/market/create/update"
                element={
                  <ProtectedRoute>
                    <CreateUpdatePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/market/create/news"
                element={
                  <ProtectedRoute>
                    <CreateNewsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/market/create/event"
                element={
                  <ProtectedRoute>
                    <CreateEventPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vote"
                element={
                  <ProtectedRoute>
                    <VotePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/membership"
                element={
                  <ProtectedRoute>
                    <MembershipPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </CreateSheetProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

function LandingRedirect() {
  const { session, loading, onboardingComplete, memberState } = useAuth();
  if (loading || (session && onboardingComplete === null)) return <PageLoader />;
  if (session && onboardingComplete) return <Navigate to="/empire" replace />;
  if (session && !onboardingComplete) {
    if (memberState?.cityId && memberState.founderNumber) {
      return <Navigate to={`/onboarding/identity?number=${memberState.founderNumber}&city=${memberState.cityId}`} replace />;
    }
    if (memberState && !memberState.cityId) {
      return <Navigate to="/onboarding/city" replace />;
    }
    return <PageLoader />;
  }
  return <LandingPage />;
}
