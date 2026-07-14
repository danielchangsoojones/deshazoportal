export type MockSpendChartItem = {
  label: string
  spend: number
}

export type MockMonthlySpend = {
  month: string
  spend: number
}

export type MockOpenItem = {
  label: string
  total: number
}

export type MockLocationAnalytics = {
  location: string
  total_units: number
  total_invoices: number
  average_invoice_cost: number
  total_invoice_cost: number
  total_equipment_cost: number
  total_labor_cost: number
  total_parts_cost: number
}

// Local placeholder data for the Spend page. This intentionally has no API or
// database dependency so every analytics panel can render in development.
export const mockToplineSpend = {
  total_equipment_spend: 742800,
  total_labor_spend: 1184600,
  total_spend: 1927400,
  total_invoices: 486,
  topline_start_str: 'Past 12 months',
}

export const mockServiceTypeSpend: MockSpendChartItem[] = [
  { label: 'Preventive Maintenance', spend: 592400 },
  { label: 'Repairs', spend: 518700 },
  { label: 'Inspections', spend: 246300 },
  { label: 'Modernization', spend: 361200 },
  { label: 'Emergency Service', spend: 208800 },
]

export const mockMonthlySpend: MockMonthlySpend[] = [
  { month: 'Aug', spend: 126800 },
  { month: 'Sep', spend: 142600 },
  { month: 'Oct', spend: 151900 },
  { month: 'Nov', spend: 137400 },
  { month: 'Dec', spend: 164200 },
  { month: 'Jan', spend: 148700 },
  { month: 'Feb', spend: 155600 },
  { month: 'Mar', spend: 172300 },
  { month: 'Apr', spend: 160900 },
  { month: 'May', spend: 178400 },
  { month: 'Jun', spend: 190100 },
  { month: 'Jul', spend: 198500 },
]

export const mockAverageInvoiceSpend: MockMonthlySpend[] = [
  { month: 'Aug', spend: 3460 },
  { month: 'Sep', spend: 3710 },
  { month: 'Oct', spend: 3890 },
  { month: 'Nov', spend: 3580 },
  { month: 'Dec', spend: 4200 },
  { month: 'Jan', spend: 3960 },
  { month: 'Feb', spend: 4050 },
  { month: 'Mar', spend: 4370 },
  { month: 'Apr', spend: 4140 },
  { month: 'May', spend: 4520 },
  { month: 'Jun', spend: 4680 },
  { month: 'Jul', spend: 4810 },
]

export const mockLocationSpend: MockSpendChartItem[] = [
  { label: 'Birmingham', spend: 453600 },
  { label: 'Huntsville', spend: 327900 },
  { label: 'Mobile', spend: 294800 },
  { label: 'Montgomery', spend: 256400 },
  { label: 'Tuscaloosa', spend: 223700 },
  { label: 'Decatur', spend: 170900 },
  { label: 'Dothan', spend: 200100 },
]

export const mockTopOpenItems: MockOpenItem[] = [
  { label: 'Hoist Brake', total: 38 },
  { label: 'Wire Rope', total: 34 },
  { label: 'Limit Switch', total: 29 },
  { label: 'Pendant Station', total: 26 },
  { label: 'Festoon Cable', total: 22 },
  { label: 'End Truck Wheels', total: 19 },
  { label: 'Bridge Drive', total: 17 },
  { label: 'Runway Alignment', total: 15 },
  { label: 'Hook Block', total: 13 },
  { label: 'Warning Device', total: 11 },
]

export const mockLocationAnalytics: MockLocationAnalytics[] = [
  { location: 'Birmingham', total_units: 86, total_invoices: 118, average_invoice_cost: 3844, total_invoice_cost: 453600, total_equipment_cost: 174200, total_labor_cost: 201400, total_parts_cost: 78000 },
  { location: 'Huntsville', total_units: 64, total_invoices: 82, average_invoice_cost: 3999, total_invoice_cost: 327900, total_equipment_cost: 121900, total_labor_cost: 147500, total_parts_cost: 58500 },
  { location: 'Mobile', total_units: 58, total_invoices: 71, average_invoice_cost: 4152, total_invoice_cost: 294800, total_equipment_cost: 110300, total_labor_cost: 132900, total_parts_cost: 51600 },
  { location: 'Montgomery', total_units: 49, total_invoices: 61, average_invoice_cost: 4203, total_invoice_cost: 256400, total_equipment_cost: 98200, total_labor_cost: 113700, total_parts_cost: 44500 },
  { location: 'Tuscaloosa', total_units: 42, total_invoices: 54, average_invoice_cost: 4143, total_invoice_cost: 223700, total_equipment_cost: 86200, total_labor_cost: 98300, total_parts_cost: 39200 },
  { location: 'Decatur', total_units: 35, total_invoices: 42, average_invoice_cost: 4069, total_invoice_cost: 170900, total_equipment_cost: 65600, total_labor_cost: 75500, total_parts_cost: 29800 },
  { location: 'Dothan', total_units: 31, total_invoices: 38, average_invoice_cost: 5266, total_invoice_cost: 200100, total_equipment_cost: 76400, total_labor_cost: 87100, total_parts_cost: 36600 },
]
