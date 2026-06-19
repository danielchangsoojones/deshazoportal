import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Login from './pages/Login'
import QuoteLogin from './pages/QuoteLogin'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import { buildCustomerPath, getStoredCustomer, useCustomerPath, useSelectedCustomer } from './lib/customerRouting'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const ContactUs = lazy(() => import('./pages/ContactUs'))
const AddNewUser = lazy(() => import('./pages/AddNewUser'))
const LocationComparison = lazy(() => import('./pages/LocationComparison'))
const Spend = lazy(() => import('./pages/Spend'))
const DocumentsReports = lazy(() => import('./pages/DocumentsReports'))
const EquipmentNotebookLLM = lazy(() => import('./pages/EquipmentNotebookLLM'))
const DeshazoInternalDashboard = lazy(() => import('./pages/DeshazoInternalDashboard'))
const QuoteAnalytics = lazy(() => import('./pages/QuoteAnalytics'))
const CustomReports = lazy(() => import('./pages/CustomReports'))
const DeshazoExternalReports = lazy(() => import('./pages/DeshazoExternalReports'))
const DeshazoWorkOrders = lazy(() => import('./pages/DeshazoWorkOrders'))
const EditableInspectionReport = lazy(() => import('./pages/EditableInspectionReport'))
const JobsQuotingList = lazy(() => import('./pages/JobsQuotingList'))
const AssetFleet = lazy(() => import('./pages/AssetFleet'))
const AssetFleetAssets = lazy(() => import('./pages/AssetFleetAssets'))
const AssetInfo = lazy(() => import('./pages/AssetInfo'))

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
        Loading...
      </div>
    </div>
  )
}

function CustomerLogin() {
  const customerPath = useCustomerPath()
  return (
    <Login
      redirectTo={customerPath('/dashboard')}
      forgotPasswordFrom="portal"
      redirectIfAuthenticated
    />
  )
}

function CustomerSignup() {
  useSelectedCustomer()
  return <Signup />
}

function CustomerForgotPassword() {
  useSelectedCustomer()
  return <ForgotPassword />
}

function CustomerResetPassword() {
  useSelectedCustomer()
  return <ResetPassword />
}

function CustomerPage({ children }: { children: React.ReactNode }) {
  useSelectedCustomer()
  return children
}

function LegacyPortalRedirect({ path }: { path: string }) {
  const location = useLocation()
  const target = `${buildCustomerPath(getStoredCustomer(), path)}${location.search}${location.hash}`
  return <Navigate to={target} replace />
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LegacyPortalRedirect path="/login" />} />
          <Route path="/quotelogin" element={<QuoteLogin />} />
          <Route path="/signup" element={<LegacyPortalRedirect path="/signup" />} />
          <Route path="/forgot-password" element={<LegacyPortalRedirect path="/forgot-password" />} />
          <Route path="/reset-password" element={<LegacyPortalRedirect path="/reset-password" />} />
          <Route path="/dashboard" element={<LegacyPortalRedirect path="/dashboard" />} />
          <Route path="/contact-us" element={<LegacyPortalRedirect path="/contact-us" />} />
          <Route path="/add-user" element={<LegacyPortalRedirect path="/add-user" />} />
          <Route path="/location-comparison" element={<LegacyPortalRedirect path="/location-comparison" />} />
          <Route path="/spend" element={<LegacyPortalRedirect path="/spend" />} />
          <Route path="/documents-reports" element={<LegacyPortalRedirect path="/documents-reports" />} />
          <Route path="/equipment-notebook-llm" element={<LegacyPortalRedirect path="/equipment-notebook-llm" />} />
          <Route path="/deshazo-internal-dashboard" element={<DeshazoInternalDashboard />} />
          <Route path="/dashazo-internal-dashboard" element={<Navigate to="/deshazo-internal-dashboard" replace />} />
          <Route path="/quote-analytics" element={<QuoteAnalytics />} />
          <Route path="/custom-reports" element={<LegacyPortalRedirect path="/custom-reports" />} />
          <Route path="/deshazo-work-orders" element={<LegacyPortalRedirect path="/deshazo-work-orders" />} />
          <Route path="/deshazo-external-reports" element={<LegacyPortalRedirect path="/deshazo-external-reports" />} />
          <Route path="/jobsquotinglist" element={<JobsQuotingList />} />
          <Route path="/inspection-report-template" element={<EditableInspectionReport />} />
          <Route path="/editable-inspection-report" element={<EditableInspectionReport />} />
          <Route path="/asset-fleet" element={<LegacyPortalRedirect path="/asset-fleet" />} />
          <Route path="/asset-fleet-assets" element={<LegacyPortalRedirect path="/asset-fleet-assets" />} />
          <Route path="/asset-info" element={<LegacyPortalRedirect path="/asset-info" />} />

          <Route path="/:customer/login" element={<CustomerLogin />} />
          <Route path="/:customer/signup" element={<CustomerSignup />} />
          <Route path="/:customer/forgot-password" element={<CustomerForgotPassword />} />
          <Route path="/:customer/reset-password" element={<CustomerResetPassword />} />
          <Route path="/:customer/dashboard" element={<CustomerPage><Dashboard /></CustomerPage>} />
          <Route path="/:customer/contact-us" element={<CustomerPage><ContactUs /></CustomerPage>} />
          <Route path="/:customer/add-user" element={<CustomerPage><AddNewUser /></CustomerPage>} />
          <Route path="/:customer/location-comparison" element={<CustomerPage><LocationComparison /></CustomerPage>} />
          <Route path="/:customer/spend" element={<CustomerPage><Spend /></CustomerPage>} />
          <Route path="/:customer/documents-reports" element={<CustomerPage><DocumentsReports /></CustomerPage>} />
          <Route path="/:customer/equipment-notebook-llm" element={<CustomerPage><EquipmentNotebookLLM /></CustomerPage>} />
          <Route path="/:customer/custom-reports" element={<CustomerPage><CustomReports /></CustomerPage>} />
          <Route path="/:customer/deshazo-work-orders" element={<CustomerPage><DeshazoWorkOrders /></CustomerPage>} />
          <Route path="/:customer/deshazo-external-reports" element={<CustomerPage><DeshazoExternalReports /></CustomerPage>} />
          <Route path="/:customer/asset-fleet" element={<CustomerPage><AssetFleet /></CustomerPage>} />
          <Route path="/:customer/asset-fleet-assets" element={<CustomerPage><AssetFleetAssets /></CustomerPage>} />
          <Route path="/:customer/asset-info" element={<CustomerPage><AssetInfo /></CustomerPage>} />
          <Route path="*" element={<LegacyPortalRedirect path="/login" />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
