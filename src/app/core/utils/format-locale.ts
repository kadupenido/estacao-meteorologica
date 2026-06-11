const LOCALE = 'pt-BR';

export function formatDecimal(value: number, minFrac = 0, maxFrac = 1): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: minFrac,
    maximumFractionDigits: maxFrac,
  }).format(value);
}

export function chartTickLabel(value: string | number, unit: string, maxFrac: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `${formatDecimal(n, 0, maxFrac)} ${unit}`;
}
