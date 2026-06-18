import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchAssetByDNumber } from '../lib/portalApi'
import { useCustomerPath } from '../lib/customerRouting'

export default function DNumberSearchBar() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const customerPath = useCustomerPath()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return

    try {
      setLoading(true)
      setError('')
      const result = await searchAssetByDNumber(trimmed)
      navigate(`${customerPath('/asset-info')}?unit_id=${result.unit_id}`)
    } catch {
      setError('No asset found.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex items-center">
      <div className={`flex items-center rounded-full border px-3 py-1.5 transition-all duration-200 ${
        error
          ? 'border-red-400/60 bg-white/10 shadow-[0_0_0_2px_rgba(248,113,113,0.25)]'
          : 'border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] focus-within:border-white/40 focus-within:bg-white/15 focus-within:shadow-[0_0_0_2px_rgba(255,255,255,0.1)]'
      }`}>
        {/* search icon */}
        <svg
          className="mr-2 h-3.5 w-3.5 shrink-0 text-white/50"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <circle cx="11" cy="11" r="8" />
          <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </svg>

        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setError('') }}
          placeholder="D number…"
          className="w-[130px] bg-transparent text-sm text-white placeholder-white/45 outline-none"
        />

        {/* spinner or search button */}
        {loading ? (
          <svg className="ml-1.5 h-4 w-4 shrink-0 animate-spin text-white/70" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : (
          <button
            type="submit"
            className="ml-1.5 shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold text-white transition hover:bg-white/30 active:scale-95"
          >
            Go
          </button>
        )}
      </div>

      {error && (
        <span className="absolute -bottom-5 left-3 text-[11px] font-medium text-red-300">
          {error}
        </span>
      )}
    </form>
  )
}
