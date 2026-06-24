import Login from './Login'

export default function QuoteLogin() {
  return (
    <Login
      redirectTo="/deshazo-internal-dashboard"
      forgotPasswordFrom="quote"
      redirectIfAuthenticated
      useCustomerRedirect={false}
    />
  )
}
