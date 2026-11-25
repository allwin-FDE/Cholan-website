// Phone boxes that take an Indian mobile number: digits only, at most 10,
// with +91 shown in front of the box (the store finder and the enquiry form).
// A pasted "+91 98765 43210" or "098765 43210" keeps just the 10 digits.
export function tenDigits(value) {
  let d = String(value ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
}

// A whole 10-digit Indian mobile number (starts with 6, 7, 8 or 9).
export const isMobile = (value) => /^[6-9]\d{9}$/.test(String(value ?? ''));
