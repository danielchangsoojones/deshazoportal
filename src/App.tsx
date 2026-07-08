import { Suspense, lazy, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
  const [positionTop, setPositionTop] = useState<number | null>(null)
  const dragState = useRef<{
    pointerId: number
    startY: number
    originTop: number
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return

    const widget = event.currentTarget.closest('[data-support-widget]') as HTMLDivElement | null
    if (!widget) return

    const rect = widget.getBoundingClientRect()
    dragState.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      originTop: rect.top,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const deltaY = event.clientY - drag.startY
    if (Math.abs(deltaY) > 4) {
      drag.moved = true
    }

    if (!drag.moved) return

    const widget = event.currentTarget.closest('[data-support-widget]') as HTMLDivElement | null
    if (!widget) return

    const margin = 12
    const maxTop = Math.max(margin, window.innerHeight - widget.offsetHeight - margin)
    const nextTop = Math.min(Math.max(margin, drag.originTop + deltaY), maxTop)

    setPositionTop(nextTop)
  }

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current
    if (!drag || drag.pointerId !== event.pointerId) return

    suppressClick.current = drag.moved
    dragState.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleWidgetClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }

    setIsOpen((open) => !open)
  }

  return (
    <div
      data-support-widget
      className={`fixed right-4 z-[80] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 sm:right-6 ${
        positionTop === null ? 'bottom-4 sm:bottom-6' : ''
      }`}
      style={positionTop === null ? undefined : { top: positionTop }}
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
              onClick={() => setIsOpen(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] text-lg font-bold leading-none text-[var(--deshazo-blue)] transition hover:bg-[var(--deshazo-surface-2)]"
              aria-label="Close contact help"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleWidgetClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="inline-flex max-w-full cursor-move touch-none select-none items-center gap-2 rounded-full border border-[rgba(255,255,255,0.7)] bg-[var(--deshazo-blue)] px-4 py-3 text-sm font-extrabold text-white shadow-[0_18px_40px_-20px_rgba(47,86,166,0.65)] transition hover:bg-[var(--deshazo-blue-deep)] focus:outline-none focus:ring-4 focus:ring-[rgba(47,86,166,0.22)] sm:px-5"
        aria-expanded={isOpen}
        title="Click for support, or drag to move"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/16 text-base">?</span>
        <span className="min-w-0 whitespace-normal text-left leading-5">Having trouble?</span>
      </button>
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
    </>
  )

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/equipment-notebook-llm" element={<EquipmentNotebookLLM />} />
          <Route path="/quote-analytics" element={<QuoteAnalytics />} />
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
