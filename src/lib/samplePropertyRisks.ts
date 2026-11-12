export const priorities = [
  { label: 'High', color: '#ef442f', badge: 'bg-red-50 text-red-800' },
  { label: 'Medium', color: '#edb632', badge: 'bg-amber-50 text-amber-900' },
  { label: 'Low', color: '#6b8cc6', badge: 'bg-blue-50 text-blue-900' },
] as const

export type Priority = (typeof priorities)[number]['label']

export type PropertyRisk = {
  title: string
  priority: Priority
  area: string
  nextStep: string
}

export type Property = {
  id: string
  name: string
  location: string
  type: string
  risks: PropertyRisk[]
}

export const sampleProperties: Property[] = [
  {
    id: 'mercer-square', name: 'Mercer Square', location: 'SoHo, Manhattan', type: 'Mixed-use',
    risks: [
      { title: 'Fire alarm fault on the third floor', priority: 'High', area: 'Fire protection', nextStep: 'Have the alarm contractor investigate the fault and confirm the affected devices are back online.' },
      { title: 'Rear exit door fails to latch', priority: 'High', area: 'Emergency egress', nextStep: 'Have the door contractor repair the latch and verify the door closes on its own.' },
      { title: 'Water staining below the roof drain', priority: 'Medium', area: 'Roof and drainage', nextStep: 'Inspect the drain and roof membrane to locate the source of moisture.' },
      { title: 'Faded loading-zone markings', priority: 'Low', area: 'Loading area', nextStep: 'Repaint the loading-zone lines during the next pavement maintenance visit.' },
    ],
  },
  {
    id: 'harbor-point', name: 'Harbor Point Center', location: 'Long Island City, Queens', type: 'Office',
    risks: [
      { title: 'Elevator emergency phone fails test', priority: 'High', area: 'Elevator 2', nextStep: 'Have the elevator vendor restore two-way communication and verify the call reaches the monitoring center.' },
      { title: 'Cooling tower service overdue', priority: 'Medium', area: 'Rooftop mechanical', nextStep: 'Confirm the last service date and schedule the next contractor visit.' },
      { title: 'Ponding near the garage entrance', priority: 'Medium', area: 'Parking garage', nextStep: 'Clear the trench drain and check whether water still pools after rain.' },
    ],
  },
  {
    id: 'willow-court', name: 'Willow Court Residences', location: 'Park Slope, Brooklyn', type: 'Residential',
    risks: [
      { title: 'Loose handrail on the east stair', priority: 'High', area: 'Common stairwell', nextStep: 'Have maintenance secure the rail and check the adjacent anchors.' },
      { title: 'Recurring leak at the laundry supply line', priority: 'Medium', area: 'Basement laundry', nextStep: 'Have a plumber identify the source and inspect the surrounding wall for moisture.' },
      { title: 'Unit numbers missing from the site map', priority: 'Low', area: 'Lobby', nextStep: 'Update the lobby map with the current unit numbering.' },
    ],
  },
  {
    id: 'union-market', name: 'Union Market Shops', location: 'Union Square, Manhattan', type: 'Retail',
    risks: [
      { title: 'Uneven pavers at the storefront', priority: 'Medium', area: 'Main entrance', nextStep: 'Inspect the raised pavers and schedule leveling work.' },
      { title: 'Service-corridor lighting is intermittent', priority: 'Medium', area: 'Service corridor', nextStep: 'Have an electrician inspect the fixtures and confirm consistent lighting.' },
      { title: 'Waste enclosure gate drags', priority: 'Low', area: 'Service yard', nextStep: 'Adjust the gate hinges during the next maintenance visit.' },
    ],
  },
  {
    id: 'northline', name: 'Northline Commerce Park', location: 'Maspeth, Queens', type: 'Industrial',
    risks: [
      { title: 'Deteriorated seal at loading bay 4', priority: 'Medium', area: 'Loading dock', nextStep: 'Replace the worn seal and check for water intrusion around the door.' },
      { title: 'Visitor parking signs are faded', priority: 'Low', area: 'Parking lot', nextStep: 'Replace the signs in the next signage order.' },
    ],
  },
  {
    id: 'cedar-row', name: 'Cedar Row Apartments', location: 'Riverdale, Bronx', type: 'Residential',
    risks: [
      { title: 'Peeling paint on courtyard benches', priority: 'Low', area: 'Courtyard', nextStep: 'Refinish the benches during the next grounds maintenance visit.' },
    ],
  },
  {
    id: 'atlas-court', name: 'Atlas Court', location: 'Midtown, Manhattan', type: 'Office',
    risks: [
      { title: 'Emergency lighting fails in the west stair', priority: 'High', area: 'West stairwell', nextStep: 'Replace the failed units and retest the stairwell on backup power.' },
      { title: 'Lobby door closes too quickly', priority: 'Medium', area: 'Main entrance', nextStep: 'Adjust the closer and check the opening and closing speed.' },
    ],
  },
  {
    id: 'briar-commons', name: 'Briar Commons', location: 'Astoria, Queens', type: 'Retail',
    risks: [
      { title: 'Delivery pallets narrow the exit route', priority: 'High', area: 'Rear passage', nextStep: 'Clear the passage and mark a separate staging area for deliveries.' },
      { title: 'Directory still lists a former tenant', priority: 'Low', area: 'Pedestrian entrance', nextStep: 'Update the directory at the next signage visit.' },
    ],
  },
  {
    id: 'canal-works', name: 'Canal Works', location: 'Gowanus, Brooklyn', type: 'Industrial',
    risks: [
      { title: 'Sprinkler valve supervisory fault', priority: 'High', area: 'Sprinkler room', nextStep: 'Have the sprinkler contractor investigate and verify the valve reports its position.' },
      { title: 'Dock bumper pulls away from the wall', priority: 'Medium', area: 'Loading dock', nextStep: 'Check the mounting hardware and replace the damaged bumper.' },
      { title: 'Bay numbers are hard to read', priority: 'Low', area: 'Truck court', nextStep: 'Refresh the bay numbers during the next striping visit.' },
    ],
  },
  {
    id: 'delancey-lofts', name: 'Delancey Lofts', location: 'Lower East Side, Manhattan', type: 'Residential',
    risks: [
      { title: 'Cracked glazing at the street entrance', priority: 'High', area: 'Entry vestibule', nextStep: 'Keep the damaged panel clear and arrange replacement glazing.' },
      { title: 'Water collects at the cellar bulkhead', priority: 'Medium', area: 'Cellar entrance', nextStep: 'Check the drain and reseal the bulkhead if needed.' },
    ],
  },
  {
    id: 'eastbank-terrace', name: 'Eastbank Terrace', location: 'Mott Haven, Bronx', type: 'Residential',
    risks: [
      { title: 'Loose threshold at the courtyard door', priority: 'Medium', area: 'Courtyard entrance', nextStep: 'Secure the threshold and check that it sits flush.' },
      { title: 'Exterior light stays on during daylight', priority: 'Low', area: 'Courtyard', nextStep: 'Check the photocell during the next lighting inspection.' },
    ],
  },
  {
    id: 'fulton-exchange', name: 'Fulton Exchange', location: 'Downtown Brooklyn', type: 'Mixed-use',
    risks: [
      { title: 'Exit sign is dark at the lower stair landing', priority: 'High', area: 'Lower level', nextStep: 'Restore the illuminated sign and test its battery backup.' },
      { title: 'Condensate line drips above a stockroom', priority: 'Medium', area: 'Retail stockroom', nextStep: 'Clear the condensate line and check the ceiling for moisture.' },
    ],
  },
  {
    id: 'granite-hall', name: 'Granite Hall', location: 'Financial District, Manhattan', type: 'Office',
    risks: [
      { title: 'Water enters around the east window frame', priority: 'Medium', area: 'Fourth-floor offices', nextStep: 'Inspect the seal and trace the leak before resealing.' },
      { title: 'Visitor sign is loose on its bracket', priority: 'Low', area: 'Reception', nextStep: 'Tighten the bracket and confirm the sign is secure.' },
    ],
  },
  {
    id: 'hudson-mews', name: 'Hudson Mews', location: 'Chelsea, Manhattan', type: 'Residential',
    risks: [
      { title: 'Access gate sticks open', priority: 'Medium', area: 'Side entrance', nextStep: 'Service the gate hinge and verify that the lock engages.' },
      { title: 'Bicycle rack has a loose anchor', priority: 'Low', area: 'Bike storage', nextStep: 'Replace the anchor during the next maintenance visit.' },
    ],
  },
  {
    id: 'ironwood-yard', name: 'Ironwood Yard', location: 'Hunts Point, Bronx', type: 'Industrial',
    risks: [
      { title: 'Vehicle barrier is damaged near the walkway', priority: 'High', area: 'Truck entrance', nextStep: 'Keep vehicles clear of the damaged barrier and arrange replacement.' },
      { title: 'Catch basin backs up after heavy rain', priority: 'Medium', area: 'Service yard', nextStep: 'Clear the basin and confirm the outlet drains freely.' },
    ],
  },
  {
    id: 'juniper-plaza', name: 'Juniper Plaza', location: 'Forest Hills, Queens', type: 'Retail',
    risks: [
      { title: 'Canopy gutter overflows onto the sidewalk', priority: 'Medium', area: 'Storefront canopy', nextStep: 'Clear the downspout and verify the gutter drains away from the entry.' },
    ],
  },
  {
    id: 'kingsland-landing', name: 'Kingsland Landing', location: 'Greenpoint, Brooklyn', type: 'Mixed-use',
    risks: [
      { title: 'Service stair door binds against the frame', priority: 'High', area: 'Service stair', nextStep: 'Have the door contractor correct the alignment and confirm it opens freely.' },
      { title: 'Package room ventilation is intermittent', priority: 'Medium', area: 'Package room', nextStep: 'Check the fan controls and confirm air is moving during occupied hours.' },
    ],
  },
  {
    id: 'linden-walk', name: 'Linden Walk', location: 'Flushing, Queens', type: 'Residential',
    risks: [
      { title: 'Hallway carpet is lifting at a seam', priority: 'Medium', area: 'Second-floor corridor', nextStep: 'Secure the loose seam and inspect the nearby carpet edges.' },
      { title: 'Laundry room signage has worn away', priority: 'Low', area: 'Laundry room', nextStep: 'Replace the posted operating instructions.' },
    ],
  },
  {
    id: 'maple-exchange', name: 'Maple Exchange', location: 'Jackson Heights, Queens', type: 'Retail',
    risks: [
      { title: 'Delivery entry intercom cuts out', priority: 'Medium', area: 'Delivery entrance', nextStep: 'Check the handset and wiring, then test calls from the entrance.' },
      { title: 'Tenant suite numbers are missing from the rear doors', priority: 'Low', area: 'Service passage', nextStep: 'Add suite identifiers to the service doors.' },
    ],
  },
  {
    id: 'orchard-row', name: 'Orchard Row', location: 'Bedford-Stuyvesant, Brooklyn', type: 'Residential',
    risks: [
      { title: 'Courtyard irrigation runs into the walkway', priority: 'Low', area: 'Courtyard', nextStep: 'Adjust the sprinkler heads to keep water off the path.' },
    ],
  },
  {
    id: 'pierline-center', name: 'Pierline Center', location: 'Sunset Park, Brooklyn', type: 'Industrial',
    risks: [
      { title: 'Roll-up door does not stop during the sensor test', priority: 'High', area: 'Loading bay 2', nextStep: 'Keep the bay closed and have the door vendor check the safety sensor.' },
      { title: 'Exterior drain grate rattles under trucks', priority: 'Medium', area: 'Truck court', nextStep: 'Inspect the frame and secure or replace the loose grate.' },
    ],
  },
  {
    id: 'quay-house', name: 'Quay House', location: 'Roosevelt Island, Manhattan', type: 'Residential',
    risks: [
      { title: 'Roof hatch gasket lets in rain', priority: 'Medium', area: 'Roof access', nextStep: 'Replace the gasket and inspect the landing for water damage.' },
      { title: 'Mailroom noticeboard has loose trim', priority: 'Low', area: 'Mailroom', nextStep: 'Reattach the trim during the next maintenance visit.' },
    ],
  },
  {
    id: 'ridgemont-offices', name: 'Ridgemont Offices', location: 'St. George, Staten Island', type: 'Office',
    risks: [
      { title: 'Air handler vibration has increased', priority: 'Medium', area: 'Mechanical room', nextStep: 'Have the mechanical contractor inspect the fan and mounts.' },
    ],
  },
  {
    id: 'stonebridge-shops', name: 'Stonebridge Shops', location: 'Fordham, Bronx', type: 'Retail',
    risks: [
      { title: 'Loose grate at the main pedestrian entrance', priority: 'Medium', area: 'Main entrance', nextStep: 'Reset the grate and confirm it sits level with the pavement.' },
      { title: 'Parking aisle arrows need repainting', priority: 'Low', area: 'Parking lot', nextStep: 'Include the arrows in the next pavement-marking visit.' },
    ],
  },
]

export function propertyRiskFilters(searchParams: URLSearchParams) {
  const filters = new URLSearchParams({ view: 'open-risk' })
  const property = searchParams.get('property')
  const priority = searchParams.get('priority')
  if (sampleProperties.some(({ id }) => id === property) && property) filters.set('property', property)
  if (priorities.some(({ label }) => label === priority) && priority) filters.set('priority', priority)
  return filters
}
