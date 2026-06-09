import Login from './Login'

export default function QuoteLogin() {
  return (
    <Login
      redirectTo="/jobsquotinglist"
      forgotPasswordFrom="quote"
      redirectIfAuthenticated
    />
  )
}
