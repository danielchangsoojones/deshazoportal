import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const ContactUs = lazy(() => import('./pages/ContactUs'))
const AddNewUser = lazy(() => import('./pages/AddNewUser'))
const LocationComparison = lazy(() => import('./pages/LocationComparison'))
const Spend = lazy(() => import('./pages/Spend'))
const DocumentsReports = lazy(() => import('./pages/DocumentsReports'))
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

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/contact-us" element={<ContactUs />} />
          <Route path="/add-user" element={<AddNewUser />} />
          <Route path="/location-comparison" element={<LocationComparison />} />
          <Route path="/spend" element={<Spend />} />
          <Route path="/documents-reports" element={<DocumentsReports />} />
          <Route path="/asset-fleet" element={<AssetFleet />} />
          <Route path="/asset-fleet-assets" element={<AssetFleetAssets />} />
          <Route path="/asset-info" element={<AssetInfo />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
