import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchAssetByDNumber } from '../lib/portalApi'

export default function DNumberSearchBar() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return

    try {
      setLoading(true)
      setError('')
      const result = await searchAssetByDNumber(trimmed)
      navigate(`/asset-info?unit_id=${result.unit_id}`)
    } catch {
      setError('No asset found.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex items-center">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setError('') }}
        placeholder="Search by D number…"
        className="w-[200px] rounded-md border border-white/30 bg-white/15 px-3 py-1.5 text-sm text-white placeholder-white/60 outline-none transition focus:border-white/60 focus:bg-white/20"
      />
      <button
        type="submit"
        disabled={loading}
        className="ml-2 rounded-md border border-white/30 bg-white/15 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/25 disabled:opacity-50"
      >
        {loading ? '…' : 'Go'}
      </button>
      {error && (
        <span className="absolute -bottom-5 left-0 text-[11px] font-medium text-red-300">
          {error}
        </span>
      )}
    </form>
  )
}
