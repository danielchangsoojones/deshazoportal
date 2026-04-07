import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import ContactUs from './pages/ContactUs'
import AddNewUser from './pages/AddNewUser'
import LocationComparison from './pages/LocationComparison'
import Spend from './pages/Spend'
import DocumentsReports from './pages/DocumentsReports'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/contact-us" element={<ContactUs />} />
        <Route path="/add-user" element={<AddNewUser />} />
        <Route path="/location-comparison" element={<LocationComparison />} />
        <Route path="/spend" element={<Spend />} />
        <Route path="/documents-reports" element={<DocumentsReports />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
