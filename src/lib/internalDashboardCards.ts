export const internalDashboardCards = [
  {
    eyebrow: 'Quotes',
    title: 'Quote List',
    description: 'Review imported quote reports, edit saved quote proposals, and refresh synced inspection work.',
    href: '/jobsquotinglist',
  },
  {
    eyebrow: 'Reporting',
    title: 'Quote Analytics',
    description: 'Review won and lost quote results, quoted totals, and amount won across saved quote items.',
    href: '/quote-analytics',
  },
  {
    eyebrow: 'Repair Trends',
    title: 'Top Cranes',
    description: 'View the ten cranes with the most repair items across the past month of crane reports.',
    href: '/top-cranes',
  },
  {
    eyebrow: 'AI Tools',
    title: 'Equipment LLM',
    description: 'Chat with quote context, inspection reports, and equipment manuals to build cited parts guidance.',
    href: '/equipment-notebook-llm',
  },
  {
    eyebrow: 'Portals',
    title: 'Customer Portals',
    description: 'Search the master customer list and open each customer portal dashboard directly.',
    href: '/customer-portals',
  },
]

export function getInternalDashboardMenuItems(activeHref: string) {
  return [
    {
      label: 'Internal Dashboard',
      active: activeHref === '/deshazo-internal-dashboard',
      href: '/deshazo-internal-dashboard',
    },
    ...internalDashboardCards.map((card) => ({
      label: card.title,
      active: card.href === activeHref,
      href: card.href,
    })),
  ]
}
