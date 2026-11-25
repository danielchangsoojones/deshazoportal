import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import DNumberSearchBar from '../components/DNumberSearchBar'
import { DeveloperBadge } from '../components/DeveloperBadge'
import ProfileMenu from '../components/ProfileMenu'
import { getCurrentSupabaseUser, isConfigured, supabase } from '../lib/supabase'
import { getCurrentUserTag, type UserTag } from '../lib/userTags'
import { useCustomerPath, useSelectedCustomer } from '../lib/customerRouting'
import { uploadWabashAssetFiles, type WabashAssetRow } from '../lib/wabashAssetCrossReference'
import { usePortalMenu } from '../lib/usePortalMenu'

type ImportRow = { id: string; file_name: string; source_row_count: number; is_duplicate: boolean; imported_at: string }

const statusLabel: Record<WabashAssetRow['match_status'], string> = {
  confirmed: 'Confirmed', candidate: 'Candidate', review: 'Review', unmatched: 'Unmatched',
}

export default function WabashAssetCrossReference() {
  const [user, setUser] = useState<User | null>(null)
  const [userTag, setUserTag] = useState<UserTag | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [rows, setRows] = useState<WabashAssetRow[]>([])
  const [imports, setImports] = useState<ImportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [plant, setPlant] = useState('All plants')
  const [status, setStatus] = useState('All matches')
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const [error, setError] = useState('')
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const navigate = useNavigate()
  const customerPath = useCustomerPath()
  const selectedCustomer = useSelectedCustomer()
  const canUpload = userTag === 'developer'

  async function loadData() {
    if (!supabase) return
    setLoading(true)
    setError('')
    const [rowsResult, importResult] = await Promise.all([
      supabase.from('wabash_asset_cross_references')
        .select('id,import_id,plant,wabash_asset_number,equipment_type,structural_support,below_hook_device_type,serial_number,rated_capacity,location,certification,d_number,candidate_d_numbers,match_status,match_method,source_row_number,sheet_name')
        .order('plant').order('wabash_asset_number').limit(5000),
      supabase.from('wabash_asset_imports')
        .select('id,file_name,source_row_count,is_duplicate,imported_at').order('imported_at', { ascending: false }).limit(100),
    ])
    if (rowsResult.error) setError(rowsResult.error.message)
    else setRows((rowsResult.data ?? []) as WabashAssetRow[])
    if (importResult.error && !rowsResult.error) setError(importResult.error.message)
    else setImports((importResult.data ?? []) as ImportRow[])
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    if (!isConfigured || !supabase) {
      navigate(customerPath('/login'))
      return
    }
    getCurrentSupabaseUser().then(async (nextUser) => {
      if (cancelled) return
      if (!nextUser) {
        navigate(customerPath('/login'))
        return
      }
      setUser(nextUser)
      setUserTag(await getCurrentUserTag(nextUser.id).catch(() => null))
      setAuthLoading(false)
    })
    return () => { cancelled = true }
  }, [customerPath, navigate])

  useEffect(() => {
    if (user) void loadData()
  }, [user])

  const plants = useMemo(() => ['All plants', ...Array.from(new Set(rows.map((row) => row.plant?.trim()).filter((value): value is string => Boolean(value)))).sort()], [rows])
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (plant !== 'All plants' && row.plant !== plant) return false
      if (status !== 'All matches' && row.match_status !== status.toLowerCase()) return false
      if (!needle) return true
      return [row.wabash_asset_number, row.d_number, row.serial_number, row.plant, row.location, row.equipment_type, ...row.candidate_d_numbers]
        .some((value) => value?.toLowerCase().includes(needle))
    })
  }, [plant, query, rows, status])

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length || !user || !canUpload) return
    setUploading(true)
    setUploadMessage('')
    setError('')
    try {
      const result = await uploadWabashAssetFiles(files, user.id)
      setUploadMessage(`${result.uploadedFiles} workbook(s) saved; ${result.importedRows.toLocaleString()} equipment rows processed (${result.confirmed} confirmed, ${result.candidate} candidates, ${result.review} for review, ${result.unmatched} unmatched).`)
      await loadData()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Workbook import failed.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut()
    navigate(customerPath('/login'))
  }

  if (authLoading || !user) return <div className="flex min-h-screen items-center justify-center">Loading Wabash asset cross-reference…</div>
  if (selectedCustomer !== 'wabash') return <main className="min-h-screen bg-[var(--bg)] p-8"><h1 className="text-2xl font-bold">Select the Wabash portal to view this page.</h1><Link to="/wabash/dashboard" className="mt-4 inline-block underline">Open Wabash portal</Link></main>

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--deshazo-text)]">
      <header className="sticky top-0 z-40 bg-[var(--deshazo-blue)] px-5 py-3 shadow-sm">
        <div className="flex w-full items-center justify-between gap-4">
          <button type="button" onClick={() => setMenuOpen((open) => !open)} className="rounded-md border-2 border-white/80 px-5 py-2.5 font-semibold text-white">Menu</button>
          <DNumberSearchBar />
          <ProfileMenu user={user} onSignOut={handleSignOut} />
        </div>
      </header>
      <div className="flex w-full">
        {menuOpen ? <aside className="hidden w-64 shrink-0 border-r bg-white p-5 lg:block"><nav className="space-y-3"><Link className="block" to={customerPath('/dashboard')}>Home</Link><Link className="block" to={customerPath('/asset-fleet')}>Asset Fleet</Link><span className="block font-bold text-[var(--deshazo-blue)]">Wabash Asset Cross-Reference</span></nav></aside> : null}
        <main className="min-w-0 flex-1 px-5 py-6 sm:px-8 lg:px-10">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-black uppercase tracking-wider text-[var(--deshazo-blue)]">Wabash equipment directory</p><h1 className="mt-1 text-3xl font-black">Asset Cross-Reference</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">Search Wabash asset IDs, serials, plants, or DeShazo D-numbers. Select a plant to narrow the list and open matched assets.</p></div>
            {canUpload ? <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[var(--deshazo-blue)] px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-[var(--deshazo-blue-deep)]"><input type="file" accept=".xlsx,.xls" multiple className="hidden" disabled={uploading} onChange={handleUpload} /><span>{uploading ? 'Processing workbooks…' : 'Upload Excel workbooks'}</span><DeveloperBadge /></label> : null}
          </div>
          {error ? <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
          {uploadMessage ? <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{uploadMessage}</div> : null}
          <section className="mb-5 rounded-xl border border-[var(--deshazo-border)] bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px_220px]">
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase text-slate-500">Search identifiers</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Wabash #, D#, serial, location…" className="h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-blue-600" /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase text-slate-500">Plant</span><select value={plant} onChange={(event) => setPlant(event.target.value)} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3">{plants.map((name) => <option key={name}>{name}</option>)}</select></label>
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase text-slate-500">Match confidence</span><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3">{['All matches', 'Confirmed', 'Candidate', 'Review', 'Unmatched'].map((name) => <option key={name}>{name}</option>)}</select></label>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-slate-600"><span>{visibleRows.length.toLocaleString()} rows shown</span><span>{rows.filter((row) => row.match_status === 'confirmed').length.toLocaleString()} confirmed D-number links</span><span>{rows.filter((row) => row.match_status === 'review').length.toLocaleString()} require review</span></div>
          </section>
          <section className="overflow-hidden rounded-xl border border-[var(--deshazo-border)] bg-white shadow-sm">
            <div className="overflow-x-auto"><table className="min-w-[1100px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{['Plant / Location', 'Wabash Asset #', 'Equipment', 'Serial #', 'DeShazo D#', 'Match'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{visibleRows.map((row) => <tr key={row.id} className="align-top hover:bg-slate-50/80"><td className="px-4 py-3"><div className="font-bold">{row.plant || 'Plant not listed'}</div><div className="mt-1 max-w-[300px] text-xs text-slate-500">{row.location || 'Location not listed'}</div></td><td className="px-4 py-3 font-bold">{row.wabash_asset_number}</td><td className="px-4 py-3"><div>{row.equipment_type || '—'}</div>{row.rated_capacity ? <div className="mt-1 text-xs text-slate-500">{row.rated_capacity} lb</div> : null}</td><td className="px-4 py-3">{row.serial_number || '—'}</td><td className="px-4 py-3">{row.d_number ? <Link to={`${customerPath('/asset-info')}?unit_id=${encodeURIComponent(row.d_number)}`} className="font-bold text-blue-700 underline">{row.d_number}</Link> : row.candidate_d_numbers.length ? <span title={row.candidate_d_numbers.join(', ')}>{row.candidate_d_numbers.join(', ')}</span> : '—'}{row.match_method ? <div className="mt-1 max-w-[280px] text-[11px] text-slate-500">{row.match_method}</div> : null}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${row.match_status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : row.match_status === 'candidate' ? 'bg-amber-100 text-amber-900' : row.match_status === 'review' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}`}>{statusLabel[row.match_status]}</span></td></tr>)}{!loading && visibleRows.length === 0 ? <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No imported equipment rows match these filters.</td></tr> : null}</tbody></table></div>
            {loading ? <div className="p-8 text-center text-slate-500">Loading equipment rows…</div> : null}
          </section>
          <section className="mt-6 rounded-xl border border-[var(--deshazo-border)] bg-white p-4 shadow-sm"><h2 className="text-lg font-black">Source workbooks</h2>{imports.length ? <ul className="mt-3 divide-y divide-slate-100">{imports.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="font-semibold">{item.file_name}{item.is_duplicate ? ' (duplicate workbook)' : ''}</span><span className="text-slate-500">{item.source_row_count.toLocaleString()} equipment rows · {new Date(item.imported_at).toLocaleDateString()}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No source workbooks imported yet.</p>}</section>
        </main>
      </div>
    </div>
  )
}
