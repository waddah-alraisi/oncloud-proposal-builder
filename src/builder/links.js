// What the workspace's records become in a proposal (ADR 0053): a contact is the client, a product a priced line, a
// quote the client, the currency and the lines, and the workspace's exchange rates the costing's FX table. Pure, so
// Node tests it; amounts arrive in minor units and leave as the major-unit strings the builder's fields hold.

/** 20000 minor units of a 3-decimal currency → "20". Trailing zeros dropped, never rounded away. */
export function major(minor, exponent = 2) {
  const n = Number(minor);
  if (!Number.isFinite(n)) return '';
  return String(Number((n / 10 ** exponent).toFixed(exponent)));
}

/** The client: its name on the cover, its id kept so the proposal stays linked to Contacts. */
export function applyClient(data, contact) {
  data.client = String(contact.display_name ?? '').trim();
  data.clientId = contact.public_id;
  if (!String(data.attention ?? '').trim() && contact.attention) data.attention = contact.attention;
  return data;
}

/**
 * A product as a line: a subscription line (quantity 1 at its price, per year) or an implementation line (its price).
 * `product`: { public_id, name, amount (major units, in the proposal's currency), currency }.
 */
export function applyProduct(data, into, product) {
  const amount = product.amount === null || product.amount === undefined ? '' : String(product.amount);
  if (into === 'subs') {
    data.subs = data.subs || [];
    data.subs.push({ line: product.name, basis: 'Per year', qty: '1', unit: amount, disc: '', when: 'In advance', product: product.public_id });
  } else {
    data.oneoff = data.oneoff || [];
    data.oneoff.push({ line: product.name, amount, disc: '', product: product.public_id });
  }
  if (!String(data.currency ?? '').trim() && product.currency) data.currency = product.currency;
  return data;
}

/**
 * A quote as the proposal's starting point: its client, currency, validity and VAT, and its lines as implementation
 * lines at their net amounts (after the line's discount). Subscription lines the proposal already has are kept: a quote
 * line carries no billing basis, so moving one into the subscription table is the writer's call.
 * `quote`: the quote record (lines included) plus `exponent`, the minor units of its currency.
 */
export function applyQuote(data, quote) {
  const exp = quote.exponent ?? 2;
  if (quote.contact) applyClient(data, quote.contact);
  data.currency = quote.currency || data.currency;
  if (quote.valid_until) data.valid = quote.valid_until;
  data.quoteId = quote.public_id;
  data.quoteNumber = quote.number || quote.title || '';
  const lines = quote.lines || [];
  const rates = [...new Set(lines.map((l) => l.tax_rate_bp).filter((r) => r !== null && r !== undefined))];
  if (rates.length === 1) data.vat = String(rates[0] / 100);
  if (lines.length) {
    data.oneoff = lines.map((l) => ({
      line: Number(l.quantity) === 1 ? String(l.description ?? '') : `${l.description ?? ''} × ${l.quantity}`,
      amount: major(l.line_net, exp),
      disc: '',
      product: l.product?.public_id ?? '',
      quoteLine: l.public_id,
    }));
  }
  return data;
}

/**
 * The workspace's rates as the costing's FX table: `1 <ccy> = rate <base>`, the latest rate per currency, from rows
 * {from_currency, to_currency, rate, rate_date} in either direction. Rates not touching the base are left out.
 */
export function fxFromRates(rows, base) {
  const b = String(base || '').toUpperCase();
  const seen = new Map();
  let asOf = '';
  const sorted = [...rows].sort((x, y) => String(y.rate_date).localeCompare(String(x.rate_date)));
  for (const r of sorted) {
    const from = String(r.from_currency).toUpperCase();
    const to = String(r.to_currency).toUpperCase();
    const rate = Number(r.rate);
    if (!(rate > 0)) continue;
    const [ccy, value] = to === b ? [from, rate] : from === b ? [to, 1 / rate] : [null, 0];
    if (!ccy || ccy === b || seen.has(ccy)) continue;
    seen.set(ccy, String(Number(value.toPrecision(8))));
    if (String(r.rate_date) > asOf) asOf = String(r.rate_date).slice(0, 10);
  }
  return { rows: [...seen].map(([ccy, rate]) => ({ ccy, rate })), asOf };
}
