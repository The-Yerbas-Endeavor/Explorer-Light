export function classifySearchInput(input) {
  const value = String(input ?? '').trim();
  if (!value) return { kind: 'empty', value };
  if (/^\d+$/.test(value)) return { kind: 'height', value: Number.parseInt(value, 10) };
  if (/^[0-9a-fA-F]{64}$/.test(value)) return { kind: 'hash', value: value.toLowerCase() };
  return { kind: 'address-or-unknown', value };
}
