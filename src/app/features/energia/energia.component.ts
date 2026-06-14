import {
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, catchError, forkJoin, of, takeUntil, timer } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartDataset } from 'chart.js';

import { ApiService } from '../../core/services/api.service';
import { SeoService } from '../../core/services/seo.service';
import { computeEnergyDaySummary } from '../../core/utils/energy-stats';
import { chartTickLabel, formatDecimal } from '../../core/utils/format-locale';
import { environment } from '../../../environments/environment';
import type { Medicao } from '../../shared/models/medicao.model';

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export type Status = 'ok' | 'warning' | 'critical' | 'unknown';
export type SaldoTone = 'positive' | 'neutral' | 'negative' | 'unknown';
export type ChartTab = 'voltage' | 'current' | 'balance';

function buildBaseChartOptions(yUnit: string, maxFrac: number): ChartConfiguration<'line'>['options'] {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        display: true,
        labels: { color: CHART_TEXT, font: { size: 12 }, boxWidth: 12, padding: 16 },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 20, 25, 0.95)',
        titleColor: '#f0f2f5',
        bodyColor: '#a8b3b8',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed.y;
            return v === null
              ? `${ctx.dataset.label}: -`
              : `${ctx.dataset.label}: ${formatDecimal(v, 0, maxFrac)} ${yUnit}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: CHART_TEXT, maxTicksLimit: 8, font: { size: 11 } },
      },
      y: {
        grid: { color: CHART_GRID },
        ticks: {
          color: CHART_TEXT,
          font: { size: 11 },
          callback: (value) => chartTickLabel(value, yUnit, maxFrac),
        },
        border: { display: false },
      },
    },
  };
}

const CHART_TEXT = '#8a96a0';
const CHART_GRID = 'rgba(128, 128, 128, 0.18)';
const COLOR_SOLAR = '#fbbf24';
const COLOR_SYSTEM = '#06b6d4';
const COLOR_BALANCE_POS = '#34d399';

@Component({
  selector: 'app-energia',
  standalone: true,
  imports: [DecimalPipe, FormsModule, BaseChartDirective],
  templateUrl: './energia.component.html',
  styleUrl: './energia.component.scss',
})
export class EnergiaComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly seo = inject(SeoService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroy$ = new Subject<void>();

  protected medicao = signal<Medicao | null>(null);
  protected loadingDados = signal(true);
  protected errorDados = signal(false);

  protected dataSelecionada = signal<string>(this.hoje());
  protected medicoes = signal<Medicao[]>([]);
  protected loadingEvolucao = signal(false);
  protected errorEvolucao = signal(false);

  protected isMobile = signal(false);
  protected chartAtivo = signal<ChartTab>('voltage');
  private nowTick = signal(Date.now());

  protected readonly chartTabs: ReadonlyArray<{ id: ChartTab; label: string }> = [
    { id: 'voltage', label: 'Tensão' },
    { id: 'current', label: 'Corrente' },
    { id: 'balance', label: 'Saldo' },
  ];

  protected readonly location = environment.location;

  private pollingSub: Subscription | null = null;
  private visibilityHandler: (() => void) | null = null;
  private pollIntervalMs = environment.refreshIntervalMs;

  protected current = computed(() => {
    const m = this.medicao();
    if (!m) return null;
    return {
      tensao_painel: m.tensao_painel,
      corrente_painel: m.corrente_painel,
      tensao_sistema: m.tensao_sistema,
      corrente_sistema: m.corrente_sistema,
      created_at: m.created_at,
    };
  });

  protected updatedAgo = computed(() => {
    this.nowTick();
    const m = this.medicao();
    if (!m) return null;
    const ts = this.parseIso(m.created_at);
    if (ts === null) return null;
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 30) return 'agora mesmo';
    if (diffSec < 60) return `há ${diffSec}s`;
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `há ${min} min`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `há ${hr} h`;
    const dias = Math.floor(hr / 24);
    return `há ${dias} d`;
  });

  protected sistemaStatus = computed<Status>(() => {
    const v = this.medicao()?.tensao_sistema;
    if (!isNum(v)) return 'unknown';
    if (v < environment.systemDangerVoltage) return 'critical';
    if (v < environment.systemWarnVoltage) return 'warning';
    return 'ok';
  });

  protected painelStatus = computed<Status>(() => {
    const v = this.medicao()?.tensao_painel;
    if (!isNum(v)) return 'unknown';
    if (v >= environment.panelOkVoltage) return 'ok';
    if (v >= environment.panelWarnVoltage) return 'warning';
    return 'unknown';
  });

  protected isHoje = computed(() => this.dataSelecionada() === this.hoje());
  protected isOntem = computed(() => this.dataSelecionada() === this.ontem());

  protected summary = computed(() => computeEnergyDaySummary(this.medicoes()));

  protected saldoTone = computed<SaldoTone>(() => {
    const saldo = this.summary().saldoWh;
    if (!isNum(saldo)) return 'unknown';
    if (saldo > 0.01) return 'positive';
    if (saldo < -0.01) return 'negative';
    return 'neutral';
  });

  private readonly baseChartOptionsVoltage = buildBaseChartOptions('V', 2);
  private readonly baseChartOptionsCurrent = buildBaseChartOptions('mA', 0);
  private readonly baseChartOptionsPower = buildBaseChartOptions('W', 3);

  protected chartOptionsVoltage: ChartConfiguration<'line'>['options'] = this.baseChartOptionsVoltage;
  protected chartOptionsCurrent: ChartConfiguration<'line'>['options'] = this.baseChartOptionsCurrent;
  protected chartOptionsBalance: ChartConfiguration<'line'>['options'] = {
    ...this.baseChartOptionsPower,
    plugins: {
      ...this.baseChartOptionsPower!.plugins,
      legend: { display: false },
    },
  };

  protected chartDataVoltage: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  protected chartDataCurrent: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  protected chartDataBalance: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };

  constructor() {
    effect(() => {
      const mobile = this.isMobile();
      const meds = this.medicoes();
      if (!isPlatformBrowser(this.platformId)) return;
      this.refreshChartOptions(mobile);
      if (meds.length > 0) this.atualizarCharts(meds);
    });
  }

  ngOnInit(): void {
    this.seo.update({
      title: 'Energia — Monitor Ambiental',
      description:
        'Painel solar, consumo do sistema e energia estimada do dia com gráficos de tensão, corrente e saldo energético.',
      keywords:
        'energia solar, painel solar, consumo, tensão, corrente, Wh, monitor ambiental, estação meteorológica',
      robots: 'index, follow',
    });

    this.fetchAllData();

    if (isPlatformBrowser(this.platformId)) {
      const mq = window.matchMedia('(max-width: 1024px)');
      this.isMobile.set(mq.matches);
      mq.addEventListener?.('change', this.handleMqChange);

      timer(30_000, 30_000)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.nowTick.set(Date.now()));

      this.startPolling();
      this.visibilityHandler = () => {
        if (document.hidden) {
          this.stopPolling();
        } else {
          this.fetchAllData();
          this.startPolling();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
    if (this.visibilityHandler && isPlatformBrowser(this.platformId)) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
    if (isPlatformBrowser(this.platformId)) {
      window.matchMedia('(max-width: 1024px)').removeEventListener?.('change', this.handleMqChange);
    }
  }

  private handleMqChange = (e: MediaQueryListEvent): void => {
    this.isMobile.set(e.matches);
  };

  protected setData(d: string): void {
    if (this.dataSelecionada() === d) return;
    this.dataSelecionada.set(d);
    this.carregar();
  }

  protected diaAnterior(): void {
    this.setData(this.somarDias(this.dataSelecionada(), -1));
  }

  protected diaProximo(): void {
    if (this.isHoje()) return;
    this.setData(this.somarDias(this.dataSelecionada(), 1));
  }

  protected irParaHoje(): void {
    this.setData(this.hoje());
  }

  protected irParaOntem(): void {
    this.setData(this.ontem());
  }

  protected onDataChange(): void {
    this.carregar();
  }

  protected tentarNovamente(): void {
    this.carregar();
  }

  protected setChartAtivo(tab: ChartTab): void {
    this.chartAtivo.set(tab);
  }

  protected formatWh(value: number | null): string {
    if (!isNum(value)) return '-';
    if (Math.abs(value) < 0.01) return '0 Wh';
    if (Math.abs(value) < 1) return `${formatDecimal(value, 2, 2)} Wh`;
    return `${formatDecimal(value, 1, 1)} Wh`;
  }

  protected formatHours(value: number | null): string {
    if (!isNum(value)) return '-';
    if (value < 1) return `${Math.round(value * 60)} min`;
    return `${formatDecimal(value, 1, 1)} h`;
  }

  protected formatPct(value: number | null): string {
    if (!isNum(value)) return '-';
    return `${formatDecimal(value, 0, 0)} %`;
  }

  private parseIso(iso: string): number | null {
    try {
      const isoUtc = this.toUtcIso(iso);
      const t = new Date(isoUtc).getTime();
      return Number.isFinite(t) ? t : null;
    } catch {
      return null;
    }
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollingSub = timer(this.pollIntervalMs, this.pollIntervalMs)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.fetchAllData());
  }

  private stopPolling(): void {
    this.pollingSub?.unsubscribe();
    this.pollingSub = null;
  }

  private hoje(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  }

  private ontem(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  }

  private somarDias(yyyymmdd: string, delta: number): string {
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
  }

  private fetchAllData(): void {
    this.loadingDados.set(true);
    this.loadingEvolucao.set(true);
    this.errorDados.set(false);
    this.errorEvolucao.set(false);

    forkJoin({
      medicao: this.api.getUltimaMedicao().pipe(
        catchError(() => {
          this.errorDados.set(true);
          return of(null as Medicao | null);
        }),
      ),
      medicoes: this.api.getMedicoesPorData(this.dataSelecionada()).pipe(
        catchError(() => {
          this.errorEvolucao.set(true);
          return of(null as Medicao[] | null);
        }),
      ),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ medicao, medicoes }) => {
          if (medicao !== null) this.medicao.set(medicao);
          if (medicoes !== null) {
            this.medicoes.set(medicoes);
            if (isPlatformBrowser(this.platformId)) {
              this.atualizarCharts(medicoes);
            }
          }
          this.loadingDados.set(false);
          this.loadingEvolucao.set(false);
        },
        error: () => {
          this.loadingDados.set(false);
          this.loadingEvolucao.set(false);
        },
      });
  }

  private carregar(): void {
    const data = this.dataSelecionada();
    this.loadingEvolucao.set(true);
    this.errorEvolucao.set(false);
    this.api.getMedicoesPorData(data).subscribe({
      next: (meds) => {
        this.medicoes.set(meds);
        this.atualizarCharts(meds);
        this.loadingEvolucao.set(false);
      },
      error: () => {
        this.errorEvolucao.set(true);
        this.loadingEvolucao.set(false);
      },
    });
  }

  private applyMobileTicks(
    base: ChartConfiguration<'line'>['options'],
    mobile: boolean,
  ): ChartConfiguration<'line'>['options'] {
    const ticks = mobile ? 5 : 8;
    return {
      ...base,
      scales: {
        ...base!.scales,
        x: {
          ...((base!.scales as Record<string, unknown>)['x'] as object),
          ticks: { color: CHART_TEXT, maxTicksLimit: ticks, font: { size: 11 } },
          grid: { display: false },
        },
      },
    };
  }

  private refreshChartOptions(mobile: boolean): void {
    this.chartOptionsVoltage = this.applyMobileTicks(this.baseChartOptionsVoltage, mobile);
    this.chartOptionsCurrent = this.applyMobileTicks(this.baseChartOptionsCurrent, mobile);
    this.chartOptionsBalance = {
      ...this.applyMobileTicks(this.baseChartOptionsPower, mobile),
      plugins: {
        ...this.baseChartOptionsPower!.plugins,
        legend: { display: false },
      },
    };
  }

  private rangeOf(values: Array<number | null>): { min: number; max: number } | null {
    const nums = values.filter(isNum);
    if (nums.length === 0) return null;
    return { min: Math.min(...nums), max: Math.max(...nums) };
  }

  private buildScaledOptions(
    base: ChartConfiguration<'line'>['options'],
    range: { min: number; max: number } | null,
    minPad = 0.05,
  ): ChartConfiguration<'line'>['options'] {
    if (!range) return base;
    const pad = Math.max((range.max - range.min) * 0.1, minPad);
    return {
      ...base,
      scales: {
        ...base!.scales,
        y: {
          ...((base!.scales as Record<string, unknown>)['y'] as object),
          suggestedMin: range.min - pad,
          suggestedMax: range.max + pad,
        },
      },
    };
  }

  private atualizarCharts(meds: Medicao[]): void {
    const useSeconds = this.detectDenseLabels(meds);
    const labels = meds.map((m) => this.formatarHora(m.created_at, useSeconds));

    const baseLine = {
      tension: 0.4,
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 6,
      spanGaps: true,
    } as const;

    const painelVoltage = meds.map((m) =>
      isNum(m.tensao_painel) ? m.tensao_painel : null,
    ) as (number | null)[];
    const sistemaVoltage = meds.map((m) =>
      isNum(m.tensao_sistema) ? m.tensao_sistema : null,
    ) as (number | null)[];
    const painelCurrent = meds.map((m) =>
      isNum(m.corrente_painel) ? m.corrente_painel : null,
    ) as (number | null)[];
    const sistemaCurrent = meds.map((m) =>
      isNum(m.corrente_sistema) ? m.corrente_sistema : null,
    ) as (number | null)[];
    const balance = meds.map((m) => {
      if (!isNum(m.potencia_painel) || !isNum(m.potencia_sistema)) return null;
      return (Math.max(0, m.potencia_painel) - m.potencia_sistema) / 1000;
    }) as (number | null)[];

    const dsPainelVoltage: ChartDataset<'line'> = {
      ...baseLine,
      data: painelVoltage,
      label: 'Painel (V)',
      borderColor: COLOR_SOLAR,
      backgroundColor: 'rgba(251, 191, 36, 0.2)',
      pointHoverBackgroundColor: COLOR_SOLAR,
      fill: false,
    };

    const dsSistemaVoltage: ChartDataset<'line'> = {
      ...baseLine,
      data: sistemaVoltage,
      label: 'Sistema (V)',
      borderColor: COLOR_SYSTEM,
      backgroundColor: 'rgba(6, 182, 212, 0.2)',
      pointHoverBackgroundColor: COLOR_SYSTEM,
      fill: false,
    };

    const dsPainelCurrent: ChartDataset<'line'> = {
      ...baseLine,
      data: painelCurrent,
      label: 'Painel (mA)',
      borderColor: COLOR_SOLAR,
      backgroundColor: 'rgba(251, 191, 36, 0.2)',
      pointHoverBackgroundColor: COLOR_SOLAR,
      fill: false,
    };

    const dsSistemaCurrent: ChartDataset<'line'> = {
      ...baseLine,
      data: sistemaCurrent,
      label: 'Sistema (mA)',
      borderColor: COLOR_SYSTEM,
      backgroundColor: 'rgba(6, 182, 212, 0.2)',
      pointHoverBackgroundColor: COLOR_SYSTEM,
      fill: false,
    };

    const dsBalance: ChartDataset<'line'> = {
      ...baseLine,
      data: balance,
      label: 'Saldo (W)',
      borderColor: COLOR_BALANCE_POS,
      backgroundColor: 'rgba(52, 211, 153, 0.18)',
      pointHoverBackgroundColor: COLOR_BALANCE_POS,
      fill: true,
    };

    this.chartDataVoltage = { labels, datasets: [dsPainelVoltage, dsSistemaVoltage] };
    this.chartDataCurrent = { labels, datasets: [dsPainelCurrent, dsSistemaCurrent] };
    this.chartDataBalance = { labels, datasets: [dsBalance] };

    this.chartOptionsVoltage = this.buildScaledOptions(
      this.chartOptionsVoltage,
      this.rangeOf([...painelVoltage, ...sistemaVoltage]),
    );
    this.chartOptionsCurrent = this.buildScaledOptions(
      this.chartOptionsCurrent,
      this.rangeOf([...painelCurrent, ...sistemaCurrent]),
      1,
    );
    this.chartOptionsBalance = this.buildScaledOptions(
      this.chartOptionsBalance,
      this.rangeOf(balance),
    );
  }

  private toUtcIso(iso: string): string {
    return iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  }

  private detectDenseLabels(meds: Medicao[]): boolean {
    if (!this.isHoje() || meds.length < 2) return false;
    const seen = new Set<string>();
    for (const m of meds) {
      const key = this.minuteKey(m.created_at);
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }

  private minuteKey(iso: string): string {
    try {
      return new Date(this.toUtcIso(iso)).toLocaleString('en-CA', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return iso;
    }
  }

  private formatarHora(iso: string, withSeconds = false): string {
    try {
      return new Date(this.toUtcIso(iso)).toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        ...(withSeconds ? { second: '2-digit' } : {}),
      });
    } catch {
      return '-';
    }
  }

  protected formatarData(iso: string): string {
    try {
      return new Date(this.toUtcIso(iso)).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '-';
    }
  }

  protected formatarDataCurta(yyyymmdd: string): string {
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    if (!y || !m || !d) return yyyymmdd;
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return dt.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}
