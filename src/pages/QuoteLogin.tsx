import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'

export default function QuoteLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isConfigured || !supabase) return

    let active = true

    supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) navigate('/jobsquotinglist', { replace: true })
    })

    return () => {
      active = false
    }
  }, [navigate])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    if (!isConfigured || !supabase) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local')
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    navigate('/jobsquotinglist', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#e8eaef] text-[#111]">
      <header className="flex h-14 items-center justify-between bg-[linear-gradient(90deg,#3cb9c5_0%,#7a35e8_100%)] px-4 text-white shadow-sm">
        <div className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold">
          Jobs Quoting
        </div>
        <div className="text-sm font-black tracking-wide">DESHAZO Quote Builder</div>
        <div className="hidden rounded-md border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold sm:block">
          Quote Portal
        </div>
      </header>

      <main className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-8">
        <section className="grid w-full max-w-[760px] overflow-hidden rounded-md border border-[#dfe4ef] bg-white shadow-[0_24px_70px_-40px_rgba(17,24,39,0.45)]">
          <div className="bg-[#fbfcff] px-7 py-8 text-center sm:px-9">
            <p className="text-[12px] font-black uppercase tracking-[0.08em] text-[#273f7a]">
              Editable Quote Master List
            </p>
            <h1 className="mt-4 text-[clamp(28px,4vw,44px)] font-black leading-tight tracking-normal text-[#1f2430]">
              Sign in to quoting
            </h1>
          </div>

          <div className="border-t border-[#dfe4ef] px-7 py-8 sm:px-9">
            {error ? (
              <div className="mb-5 rounded-md border border-[#f3c7c7] bg-[#fff5f5] px-3 py-2 text-[13px] font-bold text-[#9f1d1d]">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mx-auto grid max-w-[420px] gap-4">
              <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  placeholder="you@example.com"
                  className="rounded-md border border-[#cfd6e5] bg-white px-3 py-2.5 text-[14px] font-bold normal-case text-[#1f2430] outline-none transition placeholder:text-[#9aa2b2] focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                />
              </label>

              <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
                Password
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  placeholder="Password"
                  className="rounded-md border border-[#cfd6e5] bg-white px-3 py-2.5 text-[14px] font-bold normal-case text-[#1f2430] outline-none transition placeholder:text-[#9aa2b2] focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="mt-1 rounded-md bg-[#273f7a] px-4 py-3 text-[13px] font-black uppercase text-white transition hover:bg-[#1f3262] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Open Quote List'}
              </button>
            </form>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#dfe4ef] pt-4 text-[12px] font-bold">
              <Link to="/forgot-password?from=quote" className="text-[#273f7a] transition hover:text-[#1f3262] hover:underline">
                Forgot password?
              </Link>
              <Link to="/login" className="text-[#747b8a] transition hover:text-[#273f7a] hover:underline">
                Deshazo portal login
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
