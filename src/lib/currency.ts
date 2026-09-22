/** Best-seller price helpers: formatting an entered amount+currency for
 * display, and converting it to an approximate KRW figure for the live
 * preview in the add/edit form. Approximate rates (2026.08 기준, 대략치) — not
 * meant to be exact, just a helpful ballpark next to the local price. */

export type CurrencyCode = 'KRW' | 'USD' | 'JPY' | 'EUR' | 'GBP' | 'AUD' | 'NZD' | 'TWD' | 'THB' | 'CNY'

export const CURRENCIES: CurrencyCode[] = ['KRW', 'USD', 'JPY', 'EUR', 'GBP', 'AUD', 'NZD', 'TWD', 'THB', 'CNY']

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  KRW: 'KRW',
  USD: 'USD $',
  JPY: 'JPY 엔',
  EUR: 'EUR €',
  GBP: 'GBP £',
  AUD: 'AUD A$',
  NZD: 'NZD NZ$',
  TWD: 'TWD NT$',
  THB: 'THB ฿',
  CNY: 'CNY ¥',
}

const CURRENCY_RATES: Record<CurrencyCode, number> = {
  KRW: 1,
  USD: 1380,
  JPY: 8.6,
  EUR: 1595,
  GBP: 1750,
  AUD: 990,
  NZD: 830,
  TWD: 43.3,
  THB: 41.6,
  CNY: 193,
}

const CURRENCY_FORMAT: Record<CurrencyCode, (n: string) => string> = {
  USD: (n) => '$' + n,
  JPY: (n) => n + '엔',
  EUR: (n) => n + '€',
  GBP: (n) => '£' + n,
  AUD: (n) => 'A$' + n,
  NZD: (n) => 'NZ$' + n,
  TWD: (n) => 'NT$' + n,
  THB: (n) => n + '฿',
  CNY: (n) => '¥' + n,
  KRW: (n) => n + '원',
}

export function formatLocalPrice(amount: string | number, currency: CurrencyCode): string {
  const n = Number(amount).toLocaleString()
  const fn = CURRENCY_FORMAT[currency] || ((x: string) => x + ' ' + currency)
  return fn(n)
}

export function computeKrw(amount: string | number, currency: CurrencyCode): string | null {
  if (currency === 'KRW') return null
  const rate = CURRENCY_RATES[currency]
  if (!rate || !amount) return null
  const krw = Math.round((Number(amount) * rate) / 100) * 100
  return '약 ' + krw.toLocaleString() + '원'
}

/** Tries to parse an existing `priceLocal` string (e.g. "$42", "약 3,200엔")
 * back into {amount, currency} so the edit form can re-populate its amount +
 * currency select from a value that was only ever stored as display text. */
export function parsePriceLocal(str: string | null | undefined): { amount: string; currency: CurrencyCode } | null {
  if (!str) return null
  const s = str.replace(/,/g, '')
  const patterns: [RegExp, CurrencyCode][] = [
    [/\$([0-9.]+)/, 'USD'],
    [/£([0-9.]+)/, 'GBP'],
    [/¥([0-9.]+)/, 'CNY'],
    [/€([0-9.]+)|([0-9.]+)€/, 'EUR'],
    [/NT\$([0-9.]+)/, 'TWD'],
    [/NZ\$([0-9.]+)/, 'NZD'],
    [/A\$([0-9.]+)/, 'AUD'],
    [/([0-9.]+)엔/, 'JPY'],
    [/([0-9.]+)฿/, 'THB'],
    [/([0-9.]+)원/, 'KRW'],
  ]
  for (const [re, currency] of patterns) {
    const m = s.match(re)
    if (m) {
      const amt = m[1] || m[2]
      if (amt) return { amount: amt, currency }
    }
  }
  return null
}
