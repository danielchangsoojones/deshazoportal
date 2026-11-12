import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { phillipsCustomer, useCustomerPath, useSelectedCustomer } from '../lib/customerRouting'
import { matchSampleHeadlines, sources, splitRuleTerms, starterRules, type ScrapingRule } from '../lib/sampleScrapingRules'
import { getCurrentSupabaseUser } from '../lib/supabase'

type RuleDraft = {
  id?: string
  name: string
  keywords: string
  entities: string
  sourceIds: ScrapingRule['sourceIds']
}

const emptyDraft: RuleDraft = { name: '', keywords: '', entities: '', sourceIds: [] }
const panel = 'rounded-[16px] border border-[var(--deshazo-border)] bg-white p-5 sm:p-6'
const primaryButton = 'inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--deshazo-blue)] px-4 text-sm font-bold text-white hover:bg-[var(--deshazo-blue-deep)]'
const secondaryButton = 'inline-flex min-h-9 items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white px-3 text-sm font-bold text-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]'
const inputClass = 'mt-1.5 w-full rounded-md border border-[var(--deshazo-border)] bg-white px-3 py-2 text-sm'
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

function loadRules(storageKey: string): ScrapingRule[] {
  try {
    const value = window.localStorage.getItem(storageKey)
    if (!value) return starterRules
    const stored: ScrapingRule[] = JSON.parse(value)
    if (Array.isArray(stored) && stored.every((rule) => (
      rule && typeof rule.id === 'string' && typeof rule.name === 'string' && typeof rule.enabled === 'boolean' &&
      Array.isArray(rule.keywords) && rule.keywords.every((term) => typeof term === 'string') &&
      Array.isArray(rule.entities) && rule.entities.every((term) => typeof term === 'string') &&
      Array.isArray(rule.sourceIds) && rule.sourceIds.every((id) => sources.some((source) => source.id === id))
    ))) return stored
  } catch {
    return starterRules
  }
  return starterRules
}

export default function ScrapingRules() {
  const customer = useSelectedCustomer()
  const customerPath = useCustomerPath()
  return customer === phillipsCustomer ? <SignedInRules /> : <Navigate to={customerPath('/dashboard')} replace />
}

function SignedInRules() {
  const [userId, setUserId] = useState('')
  const navigate = useNavigate()
  const customerPath = useCustomerPath()

  useEffect(() => {
    let cancelled = false
    const goToLogin = () => {
      if (!cancelled) navigate(customerPath('/login'), { replace: true })
    }
    getCurrentSupabaseUser().then((user) => {
      if (cancelled) return
      if (user) setUserId(user.id)
      else goToLogin()
    }).catch(goToLogin)
    return () => { cancelled = true }
  }, [customerPath, navigate])

  if (!userId) return <p className="p-6 text-sm font-semibold" role="status">Loading scraping rules…</p>
  return <RulesWorkspace key={userId} storageKey={`branco-scraping-rules:${userId}`} />
}

function RulesWorkspace({ storageKey }: { storageKey: string }) {
  const customerPath = useCustomerPath()
  const [rules, setRules] = useState(() => loadRules(storageKey))
  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const [formError, setFormError] = useState('')
  const [storageError, setStorageError] = useState('')
  const matches = matchSampleHeadlines(rules)

  const updateRules = (nextRules: ScrapingRule[]) => {
    setRules(nextRules)
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextRules))
      setStorageError('')
    } catch {
      setStorageError('Browser storage is unavailable. Changes will last until you leave this page.')
    }
  }

  const openDraft = (rule?: ScrapingRule) => {
    setFormError('')
    setDraft(rule ? {
      id: rule.id, name: rule.name, keywords: rule.keywords.join(', '),
      entities: rule.entities.join(', '), sourceIds: rule.sourceIds,
    } : emptyDraft)
  }

  const saveRule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft) return
    const name = draft.name.trim()
    const keywords = splitRuleTerms(draft.keywords)
    if (!name || !keywords.length || !draft.sourceIds.length) {
      setFormError('Enter a name and at least one keyword, and choose a source.')
      return
    }

    const rule: ScrapingRule = {
      id: draft.id ?? crypto.randomUUID(), name, keywords, entities: splitRuleTerms(draft.entities),
      sourceIds: draft.sourceIds, enabled: rules.find(({ id }) => id === draft.id)?.enabled ?? true,
    }
    updateRules(draft.id ? rules.map((current) => current.id === rule.id ? rule : current) : [...rules, rule])
    setDraft(null)
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] px-5 py-6 text-[var(--deshazo-text)] sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--deshazo-border)] pb-5">
          <div>
            <Link to={customerPath('/dashboard')} className="text-sm font-bold text-[var(--deshazo-blue)] hover:underline">← Dashboard</Link>
            <h1 className="mt-3 text-[clamp(30px,4vw,44px)] font-black tracking-[-0.05em]">Scraping Rules</h1>
            <p className="mt-2 text-sm text-[#526078]">Branco Company · Rules are saved in this browser and matched against fictional headlines.</p>
          </div>
          <button type="button" className={primaryButton} onClick={() => openDraft()}>Add rule</button>
        </header>

        {storageError && <p role="status" className="text-sm font-semibold text-amber-900">{storageError}</p>}

        {draft && (
          <form className={panel} onSubmit={saveRule} aria-labelledby="rule-form-heading">
            <h2 id="rule-form-heading" className="text-xl font-extrabold">{draft.id ? 'Edit rule' : 'Add rule'}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-bold md:col-span-2">
                Rule name
                <input className={inputClass} value={draft.name} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <label className="block text-sm font-bold">
                Keywords or phrases
                <textarea className={inputClass} rows={2} placeholder="water damage, flooding" value={draft.keywords} required onChange={(event) => setDraft({ ...draft, keywords: event.target.value })} />
              </label>
              <label className="block text-sm font-bold">
                Property, company, or person names (optional)
                <textarea className={inputClass} rows={2} placeholder="Mercer Square, Juniper Bridge Lending" value={draft.entities} onChange={(event) => setDraft({ ...draft, entities: event.target.value })} />
              </label>
            </div>
            <p className="mt-2 text-sm text-[#526078]">Separate terms with commas or new lines. A match needs a keyword and, if you add names, at least one of those names.</p>
            <fieldset className="mt-4">
              <legend className="text-sm font-bold">Sources</legend>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {sources.map(({ id, label }) => (
                  <label key={id} className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" className="accent-[var(--deshazo-blue)]" checked={draft.sourceIds.includes(id)} onChange={(event) => setDraft({ ...draft, sourceIds: event.target.checked ? [...draft.sourceIds, id] : draft.sourceIds.filter((source) => source !== id) })} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {formError && <p role="alert" className="mt-3 text-sm font-semibold text-red-800">{formError}</p>}
            <div className="mt-5 flex gap-2">
              <button type="submit" className={primaryButton}>Save rule</button>
              <button type="button" className={secondaryButton} onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </form>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <section className={panel} aria-labelledby="saved-rules-heading">
            <h2 id="saved-rules-heading" className="text-xl font-extrabold">Rules <span className="ml-2 text-sm font-semibold text-[#526078]">{rules.filter((rule) => rule.enabled).length} active</span></h2>
            {rules.length === 0 && <p className="mt-4 text-sm text-[#526078]">Add a rule to start matching headlines.</p>}
            <ul className="mt-2 divide-y divide-[var(--deshazo-border)]">
              {rules.map((rule) => (
                <li key={rule.id} className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-extrabold">{rule.name}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${rule.enabled ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{rule.enabled ? 'Active' : 'Paused'}</span>
                  </div>
                  <p className="text-sm text-[#526078]"><strong>Keywords</strong> · {rule.keywords.join(', ')}</p>
                  {rule.entities.length > 0 && <p className="text-sm text-[#526078]"><strong>Names</strong> · {rule.entities.join(', ')}</p>}
                  <p className="text-sm text-[#526078]"><strong>Sources</strong> · {sources.filter(({ id }) => rule.sourceIds.includes(id)).map(({ label }) => label).join(', ')}</p>
                  <div className="flex gap-2 pt-1">
                    <button type="button" className={secondaryButton} aria-label={`Edit ${rule.name}`} onClick={() => openDraft(rule)}>Edit</button>
                    <button type="button" className={secondaryButton} aria-label={`${rule.enabled ? 'Pause' : 'Enable'} ${rule.name}`} onClick={() => updateRules(rules.map((current) => current.id === rule.id ? { ...current, enabled: !current.enabled } : current))}>{rule.enabled ? 'Pause' : 'Enable'}</button>
                    <button type="button" className={secondaryButton} aria-label={`Remove ${rule.name}`} onClick={() => {
                      if (draft?.id === rule.id) setDraft(null)
                      updateRules(rules.filter(({ id }) => id !== rule.id))
                    }}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className={panel} aria-labelledby="matched-headlines-heading">
            <h2 id="matched-headlines-heading" className="text-xl font-extrabold">Matched headlines <span className="ml-2 text-sm font-semibold text-[#526078]" aria-live="polite">{matches.length} sample {matches.length === 1 ? 'match' : 'matches'}</span></h2>
            {matches.length === 0 && <p className="mt-4 text-sm text-[#526078]">No sample headlines match your active rules.</p>}
            <ul className="mt-2 divide-y divide-[var(--deshazo-border)]">
              {matches.map((headline) => (
                <li key={headline.id} className="space-y-2 py-4">
                  <p className="text-xs font-bold text-[#526078]">{sources.find(({ id }) => id === headline.sourceId)?.label} · <time dateTime={headline.date}>{dateFormat.format(new Date(headline.date))}</time></p>
                  <h3 className="font-extrabold">{headline.title}</h3>
                  <p className="text-sm leading-6 text-[#526078]">{headline.summary}</p>
                  <div className="flex flex-wrap gap-2">
                    {headline.matches.map((match) => <span key={match.id} className="rounded-full bg-[var(--deshazo-surface)] px-3 py-1 text-xs font-bold text-[var(--deshazo-blue)]">{match.name} · {match.keywords.join(', ')}</span>)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  )
}
