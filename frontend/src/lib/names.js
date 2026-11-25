// Name boxes take letters only (any language, Tamil included), with spaces
// and the dot of an initial ("S. Ravi"). Digits and other symbols are
// dropped as they're typed (the enquiry form).
export function lettersOnly(value) {
  return String(value ?? '')
    .replace(/[^\p{L}\p{M} .]/gu, '')
    .replace(/^[ .]+/, '')
    .replace(/ {2,}/g, ' ')
    .replace(/\.{2,}/g, '.');
}

// A whole name: at least 2 characters, starting with a letter, letters,
// spaces and dots only. The server checks the same way.
export const isName = (value) => {
  const v = String(value ?? '').trim();
  return v.length >= 2 && /^\p{L}[\p{L}\p{M} .]*$/u.test(v);
};
