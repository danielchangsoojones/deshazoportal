export const sources = [
  { id: 'incident', label: 'City incident bulletins' },
  { id: 'local', label: 'Local news' },
  { id: 'trade', label: 'Real estate trade press' },
  { id: 'regulator', label: 'Regulator releases' },
] as const

type SourceId = (typeof sources)[number]['id']

export type ScrapingRule = {
  id: string
  name: string
  keywords: string[]
  entities: string[]
  sourceIds: SourceId[]
  enabled: boolean
}

export const starterRules: ScrapingRule[] = [
  { id: 'fires', name: 'Property fires', keywords: ['fire', 'smoke'], entities: ['Mercer Square', 'Canal Works'], sourceIds: ['incident', 'local'], enabled: true },
  { id: 'water', name: 'Water damage', keywords: ['water damage', 'flooding', 'pipe burst'], entities: [], sourceIds: ['incident', 'local'], enabled: true },
  { id: 'acquisitions', name: 'Portfolio acquisitions', keywords: ['acquisition', 'acquire'], entities: [], sourceIds: ['trade', 'local'], enabled: true },
  { id: 'lenders', name: 'Lender and regulatory news', keywords: ['alleged fraud', 'enforcement action'], entities: ['Juniper Bridge Lending', 'Alder Quay Capital'], sourceIds: ['regulator', 'trade'], enabled: true },
  { id: 'dui', name: 'DUI reports', keywords: ['DUI', 'driving under the influence'], entities: ['Rowan Vale'], sourceIds: ['local'], enabled: true },
]

const headlines: { id: string; sourceId: SourceId; date: string; title: string; summary: string }[] = [
  { id: 'mercer-fire', sourceId: 'incident', date: '2026-11-12', title: 'Fire crews respond to smoke at Mercer Square', summary: 'A building bulletin reported that crews investigated smoke in a service corridor.' },
  { id: 'harbor-acquisition', sourceId: 'trade', date: '2026-11-11', title: 'Alder Quay Capital announces Harbor Point Center acquisition', summary: 'The firm announced an agreement to acquire the office property, with closing pending.' },
  { id: 'lender-complaint', sourceId: 'regulator', date: '2026-11-10', title: 'Regulator files complaint alleging fraud at Juniper Bridge Lending', summary: 'The complaint describes alleged fraud in loan disclosures. The allegations have not been adjudicated.' },
  { id: 'canal-fire', sourceId: 'local', date: '2026-11-09', title: 'Small loading-dock fire contained at Canal Works', summary: 'A neighborhood report described a fire at the loading dock that crews contained.' },
  { id: 'willow-water', sourceId: 'incident', date: '2026-11-08', title: 'Water damage reported at Willow Court Residences', summary: 'A burst pipe caused flooding in the basement laundry room.' },
  { id: 'dui-report', sourceId: 'local', date: '2026-11-07', title: 'Local report says Rowan Vale was charged with DUI', summary: 'The fictional report describes a charge. It records no court outcome.' },
  { id: 'retail-leases', sourceId: 'trade', date: '2026-11-06', title: 'Union Market Shops announces two retail leases', summary: 'Two storefronts are scheduled to open next spring.' },
  { id: 'willow-outage', sourceId: 'incident', date: '2026-11-05', title: 'Power outage reported near Willow Court Residences', summary: 'A city bulletin said utility crews responded to a neighborhood power outage.' },
]

const normalizeText = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function splitRuleTerms(value: string) {
  const terms = new Map<string, string>()
  for (const term of value.split(/[,\n]/).map((part) => part.trim())) {
    const normalized = normalizeText(term)
    if (normalized && !terms.has(normalized)) terms.set(normalized, term)
  }
  return [...terms.values()]
}

export function matchSampleHeadlines(rules: ScrapingRule[]) {
  return headlines.flatMap((headline) => {
    const text = ` ${normalizeText(`${headline.title} ${headline.summary}`)} `
    const includes = (term: string) => text.includes(` ${normalizeText(term)} `)
    const matches = rules.flatMap((rule) => {
      if (!rule.enabled || !rule.sourceIds.includes(headline.sourceId)) return []
      if (rule.entities.length > 0 && !rule.entities.some(includes)) return []
      const keywords = rule.keywords.filter(includes)
      return keywords.length ? [{ id: rule.id, name: rule.name, keywords }] : []
    })
    return matches.length ? [{ ...headline, matches }] : []
  })
}
