export const internalDashboardCards = [
  {
    eyebrow: 'Dev Module',
    title: 'Full Application',
    description: 'Open a blank workspace for full application development.',
    href: '/full-application',
    developerOnly: true,
  },
  {
    eyebrow: 'Demo Module',
    title: 'Full Application - Sample',
    description: 'Explore the complete application with populated local sample data and no DeShazo Connect API dependency.',
    href: '/full-application-sample',
    developerOnly: true,
  },
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
    title: 'Green Files',
    description: 'Open the Full Application equipment notebook for crane manuals, indexed parts guidance, and cited AI chat.',
    href: '/full-application/assets/green-files',
  },
  {
    eyebrow: 'Inspection QA',
    title: 'Quality Control',
    description: 'Compare uploaded inspection report PDFs to check whether they contain the same photos.',
    href: '/quality-control',
  },
  {
    eyebrow: 'Portals',
    title: 'Customer Portals',
    description: 'Search the master customer list and open each customer portal dashboard directly.',
    href: '/customer-portals',
  },
]

export function getInternalDashboardMenuItems(activeHref: string, includeDeveloperOnly = false) {
  return [
    {
      label: 'Internal Dashboard',
      active: activeHref === '/deshazo-internal-dashboard',
      href: '/deshazo-internal-dashboard',
      developerOnly: false,
    },
    ...internalDashboardCards
      .filter((card) => includeDeveloperOnly || !card.developerOnly)
      .map((card) => ({
        label: card.title,
        active: card.href === activeHref,
        href: card.href,
        developerOnly: card.developerOnly,
      })),
  ]
}
