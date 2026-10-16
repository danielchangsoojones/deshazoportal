import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import { useCustomerPath } from '../lib/customerRouting'

type SignupProps = { embedded?: boolean }

export default function Signup({ embedded = false }: SignupProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const customerPath = useCustomerPath()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    if (!isConfigured || !supabase) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name } },
    })

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        setError('An account with this email already exists. Please use the Sign in form.')
      } else {
        setError(error.message)
      }
    } else if (data.user?.identities?.length === 0) {
      setError('An account with this email already exists. Please use the Sign in form.')
    } else if (data.session) {
      navigate(customerPath('/dashboard'))
    } else {
      setMessage('Check your email to confirm your account. Please double check your spam folder. It will be from Blockstamp: noreply@portalupdates.blockstampsf.com.')
    }

    setLoading(false)
  }

  const content = (
      <div className={`w-full rounded-2xl border border-[var(--deshazo-border)] border-t-[8px] border-t-[var(--deshazo-text)] bg-white p-8 shadow-[0_24px_70px_-44px_rgba(6,24,73,0.45)] ${embedded ? '' : 'max-w-md'}`}>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--deshazo-blue-soft)]">First visit</p>
        <h1 style={{ fontSize: '2.5rem', lineHeight: 1.1, margin: 0 }} className="mb-1 font-semibold text-[var(--deshazo-text)]">Create an account</h1>
        <p className="mb-6 text-base text-[rgba(7,18,47,0.58)]">Use your work email so your activity is recorded correctly.</p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-600">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[rgba(7,18,47,0.76)]">
              Full name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full rounded-lg border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm text-[var(--deshazo-text)] placeholder:text-[rgba(7,18,47,0.38)] focus:outline-none focus:ring-2 focus:border-[var(--deshazo-blue)] focus:ring-[rgba(6,24,73,0.16)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[rgba(7,18,47,0.76)]">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm text-[var(--deshazo-text)] placeholder:text-[rgba(7,18,47,0.38)] focus:outline-none focus:ring-2 focus:border-[var(--deshazo-blue)] focus:ring-[rgba(6,24,73,0.16)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[rgba(7,18,47,0.76)]">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm text-[var(--deshazo-text)] placeholder:text-[rgba(7,18,47,0.38)] focus:outline-none focus:ring-2 focus:border-[var(--deshazo-blue)] focus:ring-[rgba(6,24,73,0.16)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[rgba(7,18,47,0.76)]">
              Confirm password
            </label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm text-[var(--deshazo-text)] placeholder:text-[rgba(7,18,47,0.38)] focus:outline-none focus:ring-2 focus:border-[var(--deshazo-blue)] focus:ring-[rgba(6,24,73,0.16)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[var(--deshazo-blue)] hover:bg-[var(--deshazo-blue-deep)] disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

      </div>
  )

  if (embedded) return content
  return <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">{content}</div>
}
