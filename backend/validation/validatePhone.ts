export function parseRwandaPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
 
  const match = digits.match(/^(?:250)?(0?)(7\d{8})$/);

  if (!match) {
    throw new Error(`Invalid Rwandan phone number: "${raw}"`);
  }

  return `+250${match[2]}`;
}
