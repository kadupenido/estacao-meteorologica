import {
  Component,
  OnInit,
  OnDestroy,
  PLATFORM_ID,
  signal,
  inject,
  computed,
  effect,
} from '@angular/core';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { timer, Subject, takeUntil, forkJoin, of, catchError, Subscription } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartDataset } from 'chart.js';

import { ApiService, type IrrigationSummaryResponse } from '../../core/services/api.service';
import { SeoService } from '../../core/services/seo.service';
import { JsonLdService } from '../../core/services/json-ld.service';
import { environment } from '../../../environments/environment';
import type { Medicao } from '../../shared/models/medicao.model';

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export type ChartTab = 'temp' | 'umid' | 'press';

// Cores diretas (Chart.js não resolve var(--*) a partir de strings)
const CHART_TEXT = '#8a96a0';
const CHART_GRID = 'rgba(128, 128, 128, 0.18)';
const COLOR_TEMP = '#22d3ee';
const COLOR_UMID = '#34d399';
const COLOR_PRESS = '#a78bfa';
const ACTIVE_PUMP_POLL_MS = 20_000;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DecimalPipe, FormsModule, BaseChartDirective],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly seo = inject(SeoService);
  private readonly jsonLd = inject(JsonLdService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroy$ = new Subject<void>();

  protected medicao = signal<Medicao | null>(null);
  protected loadingDados = signal(true);
  protected errorDados = signal(false);

  protected dataSelecionada = signal<string>(this.hoje());
  protected medicoes = signal<Medicao[]>([]);
  protected loadingEvolucao = signal(false);
  protected errorEvolucao = signal(false);

  protected chartAtivo = signal<ChartTab>('temp');
  protected isMobile = signal(false);
  private nowTick = signal(Date.now());

  protected readonly chartTabs: ReadonlyArray<{ id: ChartTab; label: string }> = [
    { id: 'temp', label: 'Temperatura' },
    { id: 'umid', label: 'Umidade' },
    { id: 'press', label: 'Pressão' },
  ];

  protected readonly location = environment.location;

  private pollingSub: Subscription | null = null;
  private visibilityHandler: (() => void) | null = null;
  private pollIntervalMs = environment.refreshIntervalMs;

  protected current = computed(() => {
    const m = this.medicao();
    if (!m) return null;
    return {
      temperatura: m.temperatura,
      umidade: m.umidade,
      pressao: m.pressao,
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

  protected isHoje = computed(() => this.dataSelecionada() === this.hoje());
  protected isOntem = computed(() => this.dataSelecionada() === this.ontem());

  /**
   * Compara a medição mais recente com uma de ~1h antes (ou a primeira do dia,
   * se ainda não houver 1h de dados). Só calcula tendências para o dia atual.
   */
  protected trends = computed(() => {
    if (!this.isHoje()) return null;
    const cur = this.medicao();
    const meds = this.medicoes();
    if (!cur || meds.length < 2) return null;

    const curTime = new Date(this.toUtcIso(cur.created_at)).getTime();
    if (!Number.isFinite(curTime)) return null;
    const target = curTime - 60 * 60 * 1000;

    let prev: Medicao | null = null;
    for (const m of meds) {
      const t = new Date(this.toUtcIso(m.created_at)).getTime();
      if (Number.isFinite(t) && t <= target) prev = m;
    }
    if (!prev) prev = meds[0];
    if (!prev || prev.id === cur.id) return null;

    const delta = (a: number | null, b: number | null) =>
      isNum(a) && isNum(b) ? a - b : null;

    return {
      temp: delta(cur.temperatura, prev.temperatura),
      umid: delta(cur.umidade, prev.umidade),
      pressao: delta(cur.pressao, prev.pressao),
    };
  });

  protected maxMin = computed(() => {
    const m = this.medicoes();
    if (m.length === 0) return null;

    const allTemps = m.map((x) => x.temperatura).filter(isNum);
    const allUmids = m.map((x) => x.umidade).filter(isNum);
    const allPress = m.map((x) => x.pressao).filter(isNum);

    return {
      tempMin: allTemps.length ? Math.min(...allTemps) : null,
      tempMax: allTemps.length ? Math.max(...allTemps) : null,
      umidMin: allUmids.length ? Math.min(...allUmids) : null,
      umidMax: allUmids.length ? Math.max(...allUmids) : null,
      pressMin: allPress.length ? Math.min(...allPress) : null,
      pressMax: allPress.length ? Math.max(...allPress) : null,
    };
  });

  private readonly baseChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 20, 25, 0.95)',
        titleColor: '#f0f2f5',
        bodyColor: '#a8b3b8',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: CHART_TEXT, maxTicksLimit: 6, font: { size: 11 } },
      },
      y: {
        grid: { color: CHART_GRID },
        ticks: { color: CHART_TEXT, font: { size: 11 } },
        border: { display: false },
      },
    },
  };

  protected chartOptions: ChartConfiguration['options'] = this.baseChartOptions;
  protected chartOptionsPress: ChartConfiguration['options'] = this.baseChartOptions;
  protected chartOptionsTemp: ChartConfiguration['options'] = this.baseChartOptions;
  protected chartOptionsUmid: ChartConfiguration['options'] = this.baseChartOptions;
  protected chartOptionsClima: ChartConfiguration['options'] = this.baseChartOptions;

  protected chartDataTemp: ChartConfiguration['data'] = { labels: [], datasets: [] };
  protected chartDataUmid: ChartConfiguration['data'] = { labels: [], datasets: [] };
  protected chartDataClima: ChartConfiguration['data'] = { labels: [], datasets: [] };
  protected chartDataPress: ChartConfiguration['data'] = { labels: [], datasets: [] };

  constructor() {
    // Reagrupa charts quando o ponto de quebra muda (afeta maxTicksLimit/legenda).
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
      title: 'Clima — Monitor Ambiental',
      description:
        'Monitoramento em tempo real de temperatura, umidade e pressão atmosférica, com evolução diária e gráficos.',
      keywords:
        'clima, monitor ambiental, temperatura, umidade, pressão atmosférica, estação meteorológica, sensores',
    });

    this.jsonLd.setWebApplication();
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

  // ===== Date picker =====

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

  protected setChartAtivo(tab: ChartTab): void {
    this.chartAtivo.set(tab);
  }

  protected tentarNovamente(): void {
    this.carregar();
  }

  // ===== Helpers =====

  private parseIso(iso: string): number | null {
    try {
      const isoUtc =
        iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
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

  private hasActivePump(summary: IrrigationSummaryResponse | null): boolean {
    if (!summary) return false;
    return !!(summary.zone_1.manual.running || summary.zone_2.manual.running);
  }

  private syncPollInterval(summary: IrrigationSummaryResponse | null): void {
    const nextMs = this.hasActivePump(summary)
      ? ACTIVE_PUMP_POLL_MS
      : environment.refreshIntervalMs;
    if (nextMs === this.pollIntervalMs) return;
    this.pollIntervalMs = nextMs;
    this.startPolling();
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

  // ===== Network =====

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
      irrigation: this.api.getIrrigationSummary().pipe(catchError(() => of(null))),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ medicao, medicoes, irrigation }) => {
          if (medicao !== null) {
            this.medicao.set(medicao);
            this.jsonLd.setWeatherObservation(medicao);
          }
          if (medicoes !== null) {
            this.medicoes.set(medicoes);
            if (isPlatformBrowser(this.platformId)) {
              this.atualizarCharts(medicoes);
            }
          }
          this.syncPollInterval(irrigation);
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

  // ===== Charts =====

  private buildScaledOptions(
    base: ChartConfiguration['options'],
    range: { min: number; max: number } | null,
  ): ChartConfiguration['options'] {
    if (!range) return base;
    const pad = Math.max((range.max - range.min) * 0.1, 0.2);
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

  private buildClimaChartBase(mobile: boolean): ChartConfiguration['options'] {
    const ticks = mobile ? 5 : 8;
    return {
      ...this.baseChartOptions,
      plugins: {
        ...this.baseChartOptions!.plugins,
        legend: {
          display: true,
          labels: { color: CHART_TEXT, font: { size: 12 }, boxWidth: 12, padding: 16 },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: CHART_TEXT, maxTicksLimit: ticks, font: { size: 11 } },
        },
        y: {
          position: 'left',
          grid: { color: CHART_GRID },
          ticks: {
            color: CHART_TEXT,
            font: { size: 11 },
            callback: (value) => `${value} °C`,
          },
          border: { display: false },
        },
        y1: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            color: CHART_TEXT,
            font: { size: 11 },
            callback: (value) => `${value} %`,
          },
          border: { display: false },
        },
      },
    };
  }

  private buildDualScaledOptions(
    base: ChartConfiguration['options'],
    leftRange: { min: number; max: number } | null,
    rightRange: { min: number; max: number } | null,
  ): ChartConfiguration['options'] {
    if (!leftRange && !rightRange) return base;

    const padFor = (range: { min: number; max: number }, minPad: number) =>
      Math.max((range.max - range.min) * 0.1, minPad);

    const baseScales = base!.scales as Record<string, unknown>;
    const yScale = { ...(baseScales['y'] as object) };
    const y1Scale = { ...(baseScales['y1'] as object) };

    if (leftRange) {
      const pad = padFor(leftRange, 0.2);
      Object.assign(yScale, {
        suggestedMin: leftRange.min - pad,
        suggestedMax: leftRange.max + pad,
      });
    }
    if (rightRange) {
      const pad = padFor(rightRange, 1);
      Object.assign(y1Scale, {
        suggestedMin: rightRange.min - pad,
        suggestedMax: rightRange.max + pad,
      });
    }

    return {
      ...base,
      scales: {
        ...base!.scales,
        y: yScale,
        y1: y1Scale,
      },
    };
  }

  private buildPressureScaledOptions(
    base: ChartConfiguration['options'],
    range: { min: number; max: number } | null,
  ): ChartConfiguration['options'] {
    if (!range) return base;
    const span = range.max - range.min;
    const stepSize = span <= 6 ? 1 : span <= 12 ? 2 : span <= 30 ? 5 : 10;
    const min = Math.floor(range.min / stepSize) * stepSize - stepSize;
    const max = Math.ceil(range.max / stepSize) * stepSize + stepSize;
    return {
      ...base,
      scales: {
        ...base!.scales,
        y: {
          ...((base!.scales as Record<string, unknown>)['y'] as object),
          min,
          max,
          ticks: {
            color: CHART_TEXT,
            font: { size: 11 },
            stepSize,
            precision: 0,
          },
        },
      },
    };
  }

  private rangeOf(values: Array<number | null>): { min: number; max: number } | null {
    const nums = values.filter(isNum);
    if (nums.length === 0) return null;
    return { min: Math.min(...nums), max: Math.max(...nums) };
  }

  private refreshChartOptions(mobile: boolean): void {
    const ticks = mobile ? 5 : 8;
    const single: ChartConfiguration['options'] = {
      ...this.baseChartOptions,
      scales: {
        ...this.baseChartOptions!.scales,
        x: {
          ...((this.baseChartOptions!.scales as Record<string, unknown>)['x'] as object),
          ticks: { color: CHART_TEXT, maxTicksLimit: ticks, font: { size: 11 } },
          grid: { display: false },
        },
      },
    };
    const clima = this.buildClimaChartBase(mobile);
    this.chartOptions = single;
    this.chartOptionsPress = single;
    this.chartOptionsTemp = single;
    this.chartOptionsUmid = single;
    this.chartOptionsClima = clima;
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

    const tempData = meds.map((m) => (isNum(m.temperatura) ? m.temperatura : null)) as (number | null)[];
    const dsTemp: ChartDataset<'line'> = {
      ...baseLine,
      data: tempData,
      label: 'Temperatura',
      borderColor: COLOR_TEMP,
      backgroundColor: 'rgba(34, 211, 238, 0.18)',
      pointHoverBackgroundColor: COLOR_TEMP,
      fill: false,
    };

    const umidData = meds.map((m) => (isNum(m.umidade) ? m.umidade : null)) as (number | null)[];
    const dsUmid: ChartDataset<'line'> = {
      ...baseLine,
      data: umidData,
      label: 'Umidade',
      borderColor: COLOR_UMID,
      backgroundColor: 'rgba(52, 211, 153, 0.18)',
      pointHoverBackgroundColor: COLOR_UMID,
      fill: false,
    };

    const pressData = meds.map((m) => (isNum(m.pressao) ? m.pressao : null)) as (number | null)[];
    const dsPress: ChartDataset<'line'> = {
      ...baseLine,
      data: pressData,
      label: 'Pressão (hPa)',
      borderColor: COLOR_PRESS,
      backgroundColor: 'rgba(167, 139, 250, 0.2)',
      pointHoverBackgroundColor: COLOR_PRESS,
      fill: true,
    };

    this.chartDataTemp = { labels, datasets: [dsTemp] };
    this.chartDataUmid = { labels, datasets: [dsUmid] };
    this.chartDataClima = {
      labels,
      datasets: [
        { ...dsTemp, yAxisID: 'y' },
        { ...dsUmid, yAxisID: 'y1' },
      ],
    };
    this.chartDataPress = { labels, datasets: [dsPress] };

    this.chartOptionsPress = this.buildPressureScaledOptions(
      this.chartOptionsPress,
      this.rangeOf(pressData),
    );
    this.chartOptionsClima = this.buildDualScaledOptions(
      this.chartOptionsClima,
      this.rangeOf(tempData),
      this.rangeOf(umidData),
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

  protected formatarHoraExibicao(iso: string): string {
    return this.formatarHora(iso);
  }
}
