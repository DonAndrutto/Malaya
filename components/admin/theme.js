export const T = {
  bg: '#ebe4d4', panel: '#f4eee3', card: '#fbf7ee', ink: '#2a2520', muted: '#7a6f63',
  faint: 'rgba(42,37,32,0.5)', line: 'rgba(42,37,32,0.12)', line2: 'rgba(42,37,32,0.2)',
  accent: '#8a6a3b', danger: '#a4502b', good: '#5b6e4a',
  serif: '"Cormorant Garamond", "Times New Roman", serif',
  sans: '"Inter", system-ui, sans-serif',
};

export function ghostBtn(disabled) {
  return {
    background: 'transparent', border: `1px solid ${T.line2}`, color: disabled ? T.faint : T.ink,
    padding: '9px 14px', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: T.sans, opacity: disabled ? 0.5 : 1,
  };
}
