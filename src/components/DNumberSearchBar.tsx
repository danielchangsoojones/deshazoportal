import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  getCustomerDisplayName,
  getCustomerFilterValue,
  useCustomerPath,
  useSelectedCustomer,
} from '../lib/customerRouting'
import {
  DNumberSearchError,
  buildAssetInfoHref,
  buildSuggestionFilter,
  describeDNumberSearchError,
  findDNumberMatches,
  parseDNumberQuery,
  suggestDNumbers,
  toDNumberSearchError,
  type DNumberMatch,
  type DNumberSearchClient,
} from '../lib/dNumberSearch'

const SUGGESTION_DEBOUNCE_MS = 200

// supabase-js satisfies the structural client interface; its generics are just too
// rich for TypeScript to prove that directly.
const searchClient = supabase as unknown as DNumberSearchClient | null

/**
 * Header search that jumps to an asset by D# (crane contact code) for the selected
 * customer, with typeahead suggestions. Shared by every portal header.
 */
export default function DNumberSearchBar() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<DNumberMatch[]>([])
  const [listOpen, setListOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [submitting, setSubmitting] = useState(false)
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')

  const navigate = useNavigate()
  const customerPath = useCustomerPath()
  const selectedCustomer = useSelectedCustomer()
  const customerFilter = useMemo(() => getCustomerFilterValue(selectedCustomer), [selectedCustomer])
  const customerName = useMemo(() => getCustomerDisplayName(selectedCustomer), [selectedCustomer])

  const suggestAbortRef = useRef<AbortController | null>(null)
  const submitAbortRef = useRef<AbortController | null>(null)
  const listboxId = useId()
  const statusId = useId()

  // Typeahead: debounce, cancel the request in flight, ignore stale results.
  useEffect(() => {
    suggestAbortRef.current?.abort()
    setActiveIndex(-1)

    if (!searchClient || !buildSuggestionFilter(parseDNumberQuery(query))) {
      setSuggestions([])
      return
    }

    const controller = new AbortController()
    suggestAbortRef.current = controller
    const timer = window.setTimeout(() => {
      suggestDNumbers(searchClient, { customer: customerFilter, input: query, signal: controller.signal })
        .then((matches) => {
          if (!controller.signal.aborted) setSuggestions(matches)
        })
        .catch(() => {
          // Suggestions are best effort; submitting reports the real error.
          if (!controller.signal.aborted) setSuggestions([])
        })
    }, SUGGESTION_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, customerFilter])

  useEffect(() => () => submitAbortRef.current?.abort(), [])

  const goToAsset = (dNumber: string) => {
    suggestAbortRef.current?.abort()
    setListOpen(false)
    setActiveIndex(-1)
    setHint('')
    setError('')
    setQuery(dNumber)
    navigate(buildAssetInfoHref(customerPath('/asset-info'), dNumber))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (listOpen && activeIndex >= 0 && suggestions[activeIndex]) {
      goToAsset(suggestions[activeIndex].dNumber)
      return
    }

    const parsed = parseDNumberQuery(query)
    if (!parsed.normalized) return
    if (!parsed.isValid) {
      setError('Enter a D number, e.g. D012345.')
      return
    }
    if (!searchClient) {
      setError(describeDNumberSearchError(new DNumberSearchError('config', 'Supabase is not configured.')))
      return
    }

    submitAbortRef.current?.abort()
    const controller = new AbortController()
    submitAbortRef.current = controller

    try {
      setSubmitting(true)
      setError('')
      setHint('')
      const matches = await findDNumberMatches(searchClient, {
        customer: customerFilter,
        input: query,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return

      if (matches.length === 1) {
        goToAsset(matches[0].dNumber)
      } else if (matches.length > 1) {
        setSuggestions(matches)
        setHint('Several assets match. Pick one.')
        setListOpen(true)
      } else {
        setListOpen(false)
        setError(`No asset ${parsed.normalized} found for ${customerName}.`)
      }
    } catch (err) {
      if (controller.signal.aborted) return
      const searchError = toDNumberSearchError(err)
      if (searchError.kind !== 'aborted') {
        setError(describeDNumberSearchError(searchError))
      }
    } finally {
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setListOpen(false)
      setActiveIndex(-1)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if (suggestions.length === 0) return

    event.preventDefault()
    setListOpen(true)
    setActiveIndex((current) => {
      const step = event.key === 'ArrowDown' ? 1 : -1
      return (current + step + suggestions.length) % suggestions.length
    })
  }

  const handleBlur = (event: React.FocusEvent<HTMLFormElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setListOpen(false)
      setActiveIndex(-1)
    }
  }

  const showList = listOpen && suggestions.length > 0
  const activeOptionId = showList && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined

  return (
    <form role="search" onSubmit={handleSubmit} onBlur={handleBlur} className="relative flex items-center">
      <div className={`flex items-center rounded-full border px-3 py-1.5 transition-all duration-200 ${
        error
          ? 'border-red-400/60 bg-white/10 shadow-[0_0_0_2px_rgba(248,113,113,0.25)]'
          : 'border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] focus-within:border-white/40 focus-within:bg-white/15 focus-within:shadow-[0_0_0_2px_rgba(255,255,255,0.1)]'
      }`}>
        <svg
          aria-hidden="true"
          className="mr-2 h-3.5 w-3.5 shrink-0 text-white/50"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <circle cx="11" cy="11" r="8" />
          <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </svg>

        <input
          type="text"
          role="combobox"
          aria-label="Search by D number"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-describedby={statusId}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={24}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setError('')
            setHint('')
            setListOpen(true)
          }}
          onFocus={() => setListOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="D number…"
          className="w-[130px] bg-transparent text-sm text-white placeholder-white/45 outline-none"
        />

        {submitting ? (
          <svg aria-hidden="true" className="ml-1.5 h-4 w-4 shrink-0 animate-spin text-white/70" fill="none" viewBox="0 0 24 24">
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

      {showList && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[300px] overflow-hidden rounded-xl bg-white text-left shadow-[0_18px_40px_-18px_rgba(21,24,33,0.45)] ring-1 ring-black/5">
          {hint && (
            <p className="border-b border-[var(--deshazo-border)] px-3 py-2 text-[12px] font-semibold text-[rgba(21,24,33,0.6)]">
              {hint}
            </p>
          )}
          <ul id={listboxId} role="listbox" aria-label={`D numbers for ${customerName}`} className="max-h-[320px] overflow-y-auto py-1">
            {suggestions.map((match, index) => (
              <li
                key={match.dNumber}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                // Keep focus in the input so blur does not close the list before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => goToAsset(match.dNumber)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`cursor-pointer px-3 py-2 ${index === activeIndex ? 'bg-[#dbe5ff]' : 'hover:bg-[var(--deshazo-surface)]'}`}
              >
                <p className="text-sm font-bold text-[var(--deshazo-text)]">{match.dNumber}</p>
                {(match.description || match.location) && (
                  <p className="truncate text-[12px] text-[rgba(21,24,33,0.6)]">
                    {[match.description, match.location].filter(Boolean).join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <span
        id={statusId}
        role="status"
        aria-live="polite"
        className="absolute -bottom-5 left-3 whitespace-nowrap text-[11px] font-medium text-red-300"
      >
        {error}
      </span>
    </form>
  )
}
