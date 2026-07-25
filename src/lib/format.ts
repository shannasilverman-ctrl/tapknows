export function dollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

export function dollarsRounded(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  if (abs >= 1000) return `${sign}$${(abs / 100).toFixed(0)}`;
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

export function pointsFmt(n: number): string {
  return n.toLocaleString();
}

export function pct(n: number): string {
  return `${n.toFixed(0)}%`;
}
