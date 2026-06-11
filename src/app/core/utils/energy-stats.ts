import type { Medicao } from '../../shared/models/medicao.model';

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function parseMedicaoTime(iso: string): number | null {
  try {
    const isoUtc = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
    const t = new Date(isoUtc).getTime();
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

export interface EnergyDaySummary {
  energiaPainelWh: number | null;
  energiaSistemaWh: number | null;
  saldoWh: number | null;
  picoPainelW: number | null;
  picoSistemaW: number | null;
  horasGeracao: number | null;
  coberturaSolarPct: number | null;
  sampleCount: number;
}

interface TimedPoint {
  t: number;
  powerMw: number | null;
}

function sortByTime(medicoes: Medicao[]): Array<{ med: Medicao; t: number }> {
  return medicoes
    .map((med) => ({ med, t: parseMedicaoTime(med.created_at) }))
    .filter((row): row is { med: Medicao; t: number } => row.t !== null)
    .sort((a, b) => a.t - b.t);
}

/** Trapezoidal integration of power (mW) over time → Wh. */
export function integratePowerMw(points: TimedPoint[], clampZero = false): number | null {
  if (points.length < 2) return null;

  let wh = 0;
  let integrated = false;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i].powerMw;
    const p1 = points[i + 1].powerMw;
    if (!isNum(p0) || !isNum(p1)) continue;

    const dtHours = (points[i + 1].t - points[i].t) / 3_600_000;
    if (dtHours <= 0) continue;

    const v0 = clampZero ? Math.max(0, p0) : p0;
    const v1 = clampZero ? Math.max(0, p1) : p1;
    wh += ((v0 + v1) / 2 / 1000) * dtHours;
    integrated = true;
  }

  return integrated ? wh : null;
}

function averageIntervalHours(sorted: Array<{ t: number }>): number | null {
  const dts: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const dt = (sorted[i + 1].t - sorted[i].t) / 3_600_000;
    if (dt > 0) dts.push(dt);
  }
  if (dts.length === 0) return null;
  return dts.reduce((sum, dt) => sum + dt, 0) / dts.length;
}

function integrateWithTail(
  points: TimedPoint[],
  clampZero: boolean,
  avgDtHours: number | null,
): number | null {
  const base = integratePowerMw(points, clampZero);
  if (points.length === 0 || avgDtHours === null || avgDtHours <= 0) return base;

  const last = points[points.length - 1];
  if (!isNum(last.powerMw)) return base;

  const tailWh = (clampZero ? Math.max(0, last.powerMw) : last.powerMw) / 1000 * avgDtHours;
  return (base ?? 0) + tailWh;
}

function peakPowerW(values: Array<number | null>): number | null {
  const nums = values.filter(isNum);
  if (nums.length === 0) return null;
  return Math.max(...nums) / 1000;
}

function computeHorasGeracao(
  sorted: Array<{ med: Medicao; t: number }>,
): number | null {
  if (sorted.length < 2) return null;

  let hours = 0;
  let counted = false;

  for (let i = 0; i < sorted.length - 1; i++) {
    const dtHours = (sorted[i + 1].t - sorted[i].t) / 3_600_000;
    if (dtHours <= 0) continue;

    const p0 = sorted[i].med.potencia_painel;
    const p1 = sorted[i + 1].med.potencia_painel;
    const c0 = sorted[i].med.corrente_painel;
    const c1 = sorted[i + 1].med.corrente_painel;

    const generating =
      (isNum(p0) && p0 > 0) ||
      (isNum(p1) && p1 > 0) ||
      (isNum(c0) && c0 > 0) ||
      (isNum(c1) && c1 > 0);

    if (generating) {
      hours += dtHours;
      counted = true;
    }
  }

  return counted ? hours : null;
}

function computeCoberturaSolarPct(
  sorted: Array<{ med: Medicao; t: number }>,
): number | null {
  if (sorted.length < 2) return null;

  let covered = 0;
  let total = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const pPainel0 = sorted[i].med.potencia_painel;
    const pPainel1 = sorted[i + 1].med.potencia_painel;
    const pSistema0 = sorted[i].med.potencia_sistema;
    const pSistema1 = sorted[i + 1].med.potencia_sistema;

    if (!isNum(pPainel0) || !isNum(pPainel1) || !isNum(pSistema0) || !isNum(pSistema1)) {
      continue;
    }

    const avgPainel = (Math.max(0, pPainel0) + Math.max(0, pPainel1)) / 2;
    const avgSistema = (pSistema0 + pSistema1) / 2;
    total++;
    if (avgPainel >= avgSistema) covered++;
  }

  return total > 0 ? (covered / total) * 100 : null;
}

export function computeEnergyDaySummary(medicoes: Medicao[]): EnergyDaySummary {
  const sorted = sortByTime(medicoes);
  const avgDt = averageIntervalHours(sorted);

  const panelPoints: TimedPoint[] = sorted.map(({ med, t }) => ({
    t,
    powerMw: med.potencia_painel,
  }));
  const systemPoints: TimedPoint[] = sorted.map(({ med, t }) => ({
    t,
    powerMw: med.potencia_sistema,
  }));

  const energiaPainelWh = integrateWithTail(panelPoints, true, avgDt);
  const energiaSistemaWh = integrateWithTail(systemPoints, false, avgDt);
  const saldoWh =
    isNum(energiaPainelWh) && isNum(energiaSistemaWh)
      ? energiaPainelWh - energiaSistemaWh
      : null;

  return {
    energiaPainelWh,
    energiaSistemaWh,
    saldoWh,
    picoPainelW: peakPowerW(sorted.map((row) => row.med.potencia_painel)),
    picoSistemaW: peakPowerW(sorted.map((row) => row.med.potencia_sistema)),
    horasGeracao: computeHorasGeracao(sorted),
    coberturaSolarPct: computeCoberturaSolarPct(sorted),
    sampleCount: medicoes.length,
  };
}
