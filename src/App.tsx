import { Suspense, lazy, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Login from './pages/Login'
import QuoteLogin from './pages/QuoteLogin'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import OldWabash from './pages/OldWabash'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const ContactUs = lazy(() => import('./pages/ContactUs'))
const AddNewUser = lazy(() => import('./pages/AddNewUser'))
const LocationComparison = lazy(() => import('./pages/LocationComparison'))
const Spend = lazy(() => import('./pages/Spend'))
const DocumentsReports = lazy(() => import('./pages/DocumentsReports'))
const EquipmentNotebookLLM = lazy(() => import('./pages/EquipmentNotebookLLM'))
const DeshazoInternalDashboard = lazy(() => import('./pages/DeshazoInternalDashboard'))
const CustomerPortals = lazy(() => import('./pages/CustomerPortals'))
const QuoteAnalytics = lazy(() => import('./pages/QuoteAnalytics'))
const TopCranes = lazy(() => import('./pages/TopCranes'))
const QualityControl = lazy(() => import('./pages/QualityControl'))
const CustomReports = lazy(() => import('./pages/CustomReports'))
const DeshazoExternalReports = lazy(() => import('./pages/DeshazoExternalReports'))
const DeshazoWorkOrders = lazy(() => import('./pages/DeshazoWorkOrders'))
const EditableInspectionReport = lazy(() => import('./pages/EditableInspectionReport'))
const JobsQuotingList = lazy(() => import('./pages/JobsQuotingList'))
const AssetFleet = lazy(() => import('./pages/AssetFleet'))
const AssetFleetAssets = lazy(() => import('./pages/AssetFleetAssets'))
const AssetInfo = lazy(() => import('./pages/AssetInfo'))
const CustomerQuotes = lazy(() => import('./pages/CustomerQuotes'))
const FullApplication = lazy(() => import('./pages/FullApplication'))

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
        Loading...
      </div>
    </div>
  )
}

function SupportWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [isHidden, setIsHidden] = useState(false)
  const location = useLocation()

  const handleWidgetClick = () => {
    setIsOpen((open) => !open)
  }

  const handleDismiss = () => {
    setIsOpen(false)
    setIsHidden(true)
  }

  if (isHidden || location.pathname === '/full-application') return null

  return (
    <div
      data-support-widget
      className="fixed bottom-4 right-4 z-[80] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 sm:bottom-6 sm:right-6"
    >
      {isOpen ? (
        <div
          role="status"
          className="w-[min(340px,calc(100vw-2rem))] rounded-xl border border-[var(--deshazo-border)] bg-white p-4 text-[var(--deshazo-text)] shadow-[0_20px_50px_-24px_rgba(21,24,33,0.35)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-extrabold text-[var(--deshazo-blue)]">Contact us</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(21,24,33,0.72)]">
                Please contact{' '}
                <a
                  href="mailto:danieljones@blockstampsf.com"
                  className="break-all font-extrabold text-[var(--deshazo-blue)] underline decoration-[rgba(47,86,166,0.28)] underline-offset-4 hover:text-[var(--deshazo-blue-deep)]"
                >
                  danieljones@blockstampsf.com
                </a>
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] text-lg font-bold leading-none text-[var(--deshazo-blue)] transition hover:bg-[var(--deshazo-surface-2)]"
              aria-label="Hide support widget"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      <div className="relative max-w-full">
        <button
          type="button"
          onClick={handleWidgetClick}
          className="inline-flex max-w-full select-none items-center gap-2 rounded-full border border-[rgba(255,255,255,0.7)] bg-[var(--deshazo-blue)] px-4 py-3 pr-10 text-sm font-extrabold text-white shadow-[0_18px_40px_-20px_rgba(47,86,166,0.65)] transition hover:bg-[var(--deshazo-blue-deep)] focus:outline-none focus:ring-4 focus:ring-[rgba(47,86,166,0.22)] sm:px-5 sm:pr-11"
          aria-expanded={isOpen}
          title="Click for support"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/16 text-base">?</span>
          <span className="min-w-0 whitespace-normal text-left leading-5">Having trouble?</span>
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-base font-extrabold leading-none text-white transition hover:bg-white/25 focus:outline-none focus:ring-4 focus:ring-[rgba(255,255,255,0.34)]"
          aria-label="Hide support widget"
          title="Hide support widget"
        >
          ×
        </button>
      </div>
    </div>
  )
}

function App() {
  const portalRoutes = (
    <>
      <Route path="login" element={<Login />} />
      <Route path="signup" element={<Signup />} />
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="reset-password" element={<ResetPassword />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="contact-us" element={<ContactUs />} />
      <Route path="add-user" element={<AddNewUser />} />
      <Route path="location-comparison" element={<LocationComparison />} />
      <Route path="spend" element={<Spend />} />
      <Route path="documents-reports" element={<DocumentsReports />} />
      <Route path="equipment-notebook-llm" element={<EquipmentNotebookLLM />} />
      <Route path="quote-analytics" element={<QuoteAnalytics />} />
      <Route path="custom-reports" element={<CustomReports />} />
      <Route path="deshazo-work-orders" element={<DeshazoWorkOrders />} />
      <Route path="deshazo-external-reports" element={<DeshazoExternalReports />} />
      <Route path="asset-fleet" element={<AssetFleet />} />
      <Route path="asset-fleet-assets" element={<AssetFleetAssets />} />
      <Route path="asset-info" element={<AssetInfo />} />
      <Route path="customer-quotes" element={<CustomerQuotes />} />
    </>
  )

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/equipment-notebook-llm" element={<EquipmentNotebookLLM />} />
          <Route path="/quote-analytics" element={<QuoteAnalytics />} />
          <Route path="/spend" element={<Spend />} />
          <Route path="/location-comparison" element={<LocationComparison />} />
          <Route path="/top-cranes" element={<TopCranes />} />
          <Route path="/quality-control" element={<QualityControl />} />
          <Route path="/:customer">
            {portalRoutes}
          </Route>
          <Route path="/login" element={<OldWabash />} />
          <Route path="/dashboard" element={<OldWabash />} />
          <Route path="/quotelogin" element={<QuoteLogin />} />
          <Route path="/deshazo-internal-dashboard" element={<DeshazoInternalDashboard />} />
          <Route path="/dashazo-internal-dashboard" element={<Navigate to="/deshazo-internal-dashboard" replace />} />
          <Route path="/full-application" element={<FullApplication />} />
          <Route path="/customer-portals" element={<CustomerPortals />} />
          <Route path="/jobsquotinglist" element={<JobsQuotingList />} />
          <Route path="/inspection-report-template" element={<EditableInspectionReport />} />
          <Route path="/editable-inspection-report" element={<EditableInspectionReport />} />
          <Route path="*" element={<Navigate to="/wabash/login" replace />} />
        </Routes>
        <SupportWidget />
      </Suspense>
    </BrowserRouter>
  )
}

export default App
