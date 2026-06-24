import { describe, expect, it } from 'vitest';

import type { Medicao } from '../../shared/models/medicao.model';
import { computeEnergyDaySummary, integratePowerMw } from './energy-stats';

function med(
  id: number,
  created_at: string,
  overrides: Partial<
    Pick<Medicao, 'potencia_painel' | 'potencia_sistema' | 'corrente_painel' | 'corrente_sistema'>
  > = {},
): Medicao {
  return {
    id,
    created_at,
    temperatura: null,
    umidade: null,
    pressao: null,
    tensao_painel: null,
    corrente_painel: null,
    potencia_painel: null,
    tensao_sistema: null,
    corrente_sistema: null,
    potencia_sistema: null,
    umidade_solo_1: null,
    umidade_solo_2: null,
    adc_solo_1: null,
    adc_solo_2: null,
    tempo_irrigacao_s_1: null,
    tempo_irrigacao_s_2: null,
    ...overrides,
  };
}

describe('integratePowerMw', () => {
  it('returns null for fewer than two points', () => {
    expect(integratePowerMw([{ t: 0, powerMw: 1000 }])).toBeNull();
    expect(integratePowerMw([])).toBeNull();
  });

  it('integrates constant power over one hour', () => {
    const wh = integratePowerMw([
      { t: Date.parse('2025-06-10T10:00:00Z'), powerMw: 1000 },
      { t: Date.parse('2025-06-10T11:00:00Z'), powerMw: 1000 },
    ]);
    expect(wh).toBeCloseTo(1, 5);
  });

  it('uses trapezoidal rule for irregular intervals', () => {
    const wh = integratePowerMw([
      { t: Date.parse('2025-06-10T10:00:00Z'), powerMw: 500 },
      { t: Date.parse('2025-06-10T10:30:00Z'), powerMw: 1500 },
    ]);
    expect(wh).toBeCloseTo(0.5, 5);
  });

  it('clamps negative panel power when requested', () => {
    const wh = integratePowerMw(
      [
        { t: Date.parse('2025-06-10T10:00:00Z'), powerMw: -100 },
        { t: Date.parse('2025-06-10T11:00:00Z'), powerMw: 1000 },
      ],
      true,
    );
    expect(wh).toBeCloseTo(0.5, 5);
  });
});

describe('computeEnergyDaySummary', () => {
  it('returns null metrics for empty input', () => {
    const summary = computeEnergyDaySummary([]);
    expect(summary.sampleCount).toBe(0);
    expect(summary.energiaPainelWh).toBeNull();
    expect(summary.energiaSistemaWh).toBeNull();
    expect(summary.saldoWh).toBeNull();
  });

  it('computes panel and system energy with tail on last sample', () => {
    const summary = computeEnergyDaySummary([
      med(1, '2025-06-10T10:00:00Z', {
        potencia_painel: 1000,
        potencia_sistema: 400,
        corrente_painel: 120,
        corrente_sistema: 50,
      }),
      med(2, '2025-06-10T11:00:00Z', {
        potencia_painel: 1000,
        potencia_sistema: 400,
        corrente_painel: 150,
        corrente_sistema: 60,
      }),
    ]);

    expect(summary.energiaPainelWh).toBeCloseTo(2, 5);
    expect(summary.energiaSistemaWh).toBeCloseTo(0.8, 5);
    expect(summary.saldoWh).toBeCloseTo(1.2, 5);
    expect(summary.picoPainelMa).toBe(150);
    expect(summary.picoSistemaMa).toBe(60);
    expect(summary.horasGeracao).toBeCloseTo(1, 5);
    expect(summary.coberturaSolarPct).toBe(100);
  });

  it('computes solar coverage across mixed intervals', () => {
    const summary = computeEnergyDaySummary([
      med(1, '2025-06-10T10:00:00Z', { potencia_painel: 1000, potencia_sistema: 400 }),
      med(2, '2025-06-10T10:10:00Z', { potencia_painel: 1000, potencia_sistema: 600 }),
      med(3, '2025-06-10T10:20:00Z', { potencia_painel: 200, potencia_sistema: 900 }),
    ]);

    expect(summary.coberturaSolarPct).toBe(50);
  });
});
