import { NextResponse, type NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { getCurrentUser } from '@/lib/auth'
import { canViewFinancials } from '@/lib/authz'
import { getCustomerReport, getProjectEfficiency, getYearRevenue, getYearUsage } from '@/lib/reports'
import { getBranding } from '@/lib/branding'
import { parsePeriod } from '@/lib/reports-calc'

const EUR_FORMAT = '#,##0.00 "€"'
const MONTHS_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role === 'EMPLOYEE' || !canViewFinancials(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const yearParam = request.nextUrl.searchParams.get('year')
  const year =
    yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : new Date().getUTCFullYear()

  const range = parsePeriod(request.nextUrl.searchParams.get('period'))
  const [revenue, usage, efficiency, customers] = await Promise.all([
    getYearRevenue(year),
    getYearUsage(year, range),
    getProjectEfficiency(year, range),
    getCustomerReport(year, range),
  ])

  const workbook = new ExcelJS.Workbook()
  workbook.creator = (await getBranding()).companyName
  workbook.created = new Date()

  // ── Sheet 1: Monatsplanumsatz ────────────────────────────
  const sheet = workbook.addWorksheet(`Monatsplanumsatz ${year}`)
  sheet.columns = [
    { header: '', key: 'label', width: 42 },
    { header: '', key: 'customer', width: 24 },
    { header: '', key: 'price', width: 18 },
  ]

  const bold = { bold: true }
  for (const m of revenue.months) {
    if (m.own.length === 0 && m.sub.length === 0) continue

    const monthRow = sheet.addRow([`${MONTHS_DE[m.month]} ${year}`])
    monthRow.font = { bold: true, size: 13 }

    const headerRow = sheet.addRow(['Baustelle', 'Kunde', 'Planumsatz netto'])
    headerRow.font = bold
    headerRow.border = { bottom: { style: 'thin' } }

    for (const p of m.own) {
      const row = sheet.addRow([p.name, p.customer, p.price])
      row.getCell(3).numFmt = EUR_FORMAT
    }
    const ownRow = sheet.addRow(['Eigene Leute', '', m.ownTotal])
    ownRow.font = { bold: true, italic: true }
    ownRow.getCell(3).numFmt = EUR_FORMAT

    if (m.sub.length > 0) {
      for (const p of m.sub) {
        const row = sheet.addRow([p.name, p.customer, p.price])
        row.getCell(3).numFmt = EUR_FORMAT
      }
      const subRow = sheet.addRow(['SUB', '', m.subTotal])
      subRow.font = { bold: true, italic: true }
      subRow.getCell(3).numFmt = EUR_FORMAT
    }

    const totalRow = sheet.addRow(['Geplanter Umsatz', '', m.total])
    totalRow.font = bold
    totalRow.getCell(3).numFmt = EUR_FORMAT
    totalRow.border = { top: { style: 'thin' }, bottom: { style: 'double' } }

    sheet.addRow([])
  }
  const yearRow = sheet.addRow([`Jahressumme ${year}`, '', revenue.yearTotal])
  yearRow.font = { bold: true, size: 13 }
  yearRow.getCell(3).numFmt = EUR_FORMAT

  // ── Sheet 2: Auslastung ──────────────────────────────────
  const usageSheet = workbook.addWorksheet(`Auslastung ${year}`)
  usageSheet.columns = [
    { header: 'Mitarbeiter', key: 'e', width: 30 },
    { header: 'Einsatztage', key: 'ed', width: 14 },
    { header: '', key: 'gap', width: 4 },
    { header: 'Fahrzeug', key: 'v', width: 24 },
    { header: 'Einsatztage', key: 'vd', width: 14 },
  ]
  usageSheet.getRow(1).font = bold
  const maxRows = Math.max(usage.employees.length, usage.vehicles.length)
  for (let i = 0; i < maxRows; i++) {
    usageSheet.addRow([
      usage.employees[i]?.name ?? '',
      usage.employees[i]?.days ?? '',
      '',
      usage.vehicles[i]?.name ?? '',
      usage.vehicles[i]?.days ?? '',
    ])
  }

  // ── Sheet 3: Plan vs. Ist ────────────────────────────────
  const effSheet = workbook.addWorksheet(`Plan vs Ist ${year}`)
  effSheet.columns = [
    { header: 'Nr.', key: 'n', width: 12 },
    { header: 'Projekt', key: 'p', width: 36 },
    { header: 'Kunde', key: 'c', width: 24 },
    { header: 'Auftragswert', key: 'price', width: 16 },
    { header: 'Tage Plan', key: 'pd', width: 12 },
    { header: 'Tage Ist', key: 'ad', width: 12 },
    { header: 'Personentage', key: 'ppd', width: 14 },
    { header: '€ / Personentag', key: 'rpd', width: 16 },
    { header: 'Verzug Ende (Tage)', key: 'dl', width: 18 },
  ]
  effSheet.getRow(1).font = bold
  for (const r of efficiency.rows) {
    const row = effSheet.addRow([
      r.number,
      r.name,
      r.customer,
      r.price ?? '',
      r.plannedDays ?? '',
      r.actualDays || '',
      r.personDays || '',
      r.revenuePerPersonDay ?? '',
      r.delayDays ?? '',
    ])
    row.getCell(4).numFmt = EUR_FORMAT
    row.getCell(8).numFmt = EUR_FORMAT
  }
  const avgRow = effSheet.addRow([
    '',
    `Ø ${year}`,
    '',
    '',
    efficiency.avg.plannedDays ?? '',
    efficiency.avg.actualDays ?? '',
    '',
    efficiency.avg.revenuePerPersonDay ?? '',
    efficiency.avg.delayDays ?? '',
  ])
  avgRow.font = bold
  avgRow.getCell(8).numFmt = EUR_FORMAT

  // ── Sheet 4: Kunden ──────────────────────────────────────
  const custSheet = workbook.addWorksheet(`Kunden ${year}`)
  custSheet.columns = [
    { header: 'Kunde', key: 'c', width: 32 },
    { header: 'Projekte', key: 'p', width: 12 },
    { header: 'Umsatz', key: 'r', width: 16 },
    { header: 'Anteil %', key: 's', width: 10 },
  ]
  custSheet.getRow(1).font = bold
  for (const c of customers.top) {
    const row = custSheet.addRow([c.name, c.projects, c.revenue, c.share])
    row.getCell(3).numFmt = EUR_FORMAT
  }
  const custTotal = custSheet.addRow(['Gesamt', '', customers.total, ''])
  custTotal.font = bold
  custTotal.getCell(3).numFmt = EUR_FORMAT

  const buffer = await workbook.xlsx.writeBuffer()
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Monatsplanumsatz_${year}.xlsx"`,
    },
  })
}
