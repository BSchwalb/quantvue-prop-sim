const intFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })
const dec2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pctFmt = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 0 })

export const usd = (n: number) => (n < 0 ? '−$' : '$') + intFmt.format(Math.abs(Math.round(n)))
export const ratio = (n: number) => (Number.isFinite(n) ? dec2.format(n) + 'x' : '∞')
export const pct = (n: number) => pctFmt.format(n)
export const num2 = (n: number) => (Number.isFinite(n) ? dec2.format(n) : '∞')
export const fmtDate = (d: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '–')
export const MONTHS_DE = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
export const fmtMonth = (m: string) => `${MONTHS_DE[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`
