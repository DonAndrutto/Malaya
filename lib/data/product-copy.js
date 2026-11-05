// Keep catalogue and ledger copy consistent, including older base records and
// future overrides. SKU suffixes and references to real diamonds are untouched.
export function normaliseStoneCopy(value) {
  return typeof value === 'string' ? value.replace(/\bCZ\s+diamonds?\b/gi, 'cubic zirconia') : value;
}
