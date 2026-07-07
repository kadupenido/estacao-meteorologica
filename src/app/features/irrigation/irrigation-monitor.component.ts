import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, Subscription, catchError, forkJoin, of, takeUntil, timer } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartDataset } from 'chart.js';

import { ApiService, type IrrigationSummaryResponse } from '../../core/services/api.service';
import { SeoService } from '../../core/services/seo.service';
import { environment } from '../../../environments/environment';
import { chartTickLabel, formatDecimal } from '../../core/utils/format-locale';
import type { Medicao } from '../../shared/models/medicao.model';

const MANUAL_DURATION_MIN_S = 1;
const MANUAL_DURATION_MAX_S = 600;
const ACTIVE_MANUAL_POLL_MS = 20_000;

const CHART_TEXT = '#8a96a0';
const CHART_GRID = 'rgba(128, 128, 128, 0.18)';
const COLOR_ZONE_1 = '#34d399';
const COLOR_ZONE_2 = '#22d3ee';

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

interface ManualFeedback {
  kind: 'success' | 'error';
  text: string;
}

@Component({
  selector: 'app-irrigation-monitor',
  standalone: true,
  imports: [DecimalPipe, RouterLink, ReactiveFormsModule, FormsModule, BaseChartDirective],
  templateUrl: './irrigation-monitor.component.html',
  styleUrl: './irrigation-monitor.component.scss',
})
export class IrrigationMonitorComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly seo = inject(SeoService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroy$ = new Subject<void>();

  protected readonly location = environment.location;

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly summary = signal<IrrigationSummaryResponse | null>(null);

  protected readonly dataSelecionada = signal<string>(this.hoje());
  protected readonly medicoes = signal<Medicao[]>([]);
  protected readonly loadingEvolucao = signal(false);
  protected readonly errorEvolucao = signal(false);

  protected readonly isHoje = computed(() => this.dataSelecionada() === this.hoje());
  protected readonly isOntem = computed(() => this.dataSelecionada() === this.ontem());

  protected readonly manualCtrl1 = this.buildManualControl();
  protected readonly manualCtrl2 = this.buildManualControl();
  protected readonly manualBusy1 = signal(false);
  protected readonly manualBusy2 = signal(false);
  protected readonly manualMsg1 = signal<ManualFeedback | null>(null);
  protected readonly manualMsg2 = signal<ManualFeedback | null>(null);

  protected readonly now = signal(Date.now());
  private nowTick = signal(Date.now());

  protected readonly dataTimestamp = computed((): string | null => {
    const s = this.summary();
    if (!s) return null;
    const timestamps = [s.zone_1.current_soil_humidity_at, s.zone_2.current_soil_humidity_at].filter(
      (v): v is string => !!v,
    );
    if (timestamps.length === 0) return null;
    let latest = timestamps[0];
    let latestMs = this.parseTimestamp(latest) ?? 0;
    for (const ts of timestamps.slice(1)) {
      const ms = this.parseTimestamp(ts);
      if (ms !== null && ms > latestMs) {
        latest = ts;
        latestMs = ms;
      }
    }
    return latest;
  });

  protected readonly updatedAgo = computed(() => {
    this.nowTick();
    const ts = this.dataTimestamp();
    if (!ts) return null;
    const ms = this.parseTimestamp(ts);
    if (ms === null) return null;
    const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (diffSec < 30) return 'agora mesmo';
    if (diffSec < 60) return `há ${diffSec}s`;
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `há ${min} min`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `há ${hr} h`;
    const dias = Math.floor(hr / 24);
    return `há ${dias} d`;
  });

  protected chartDataSolo: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  protected chartOptionsSolo: ChartConfiguration<'line'>['options'] = this.buildChartOptions();

  private pollingSub: Subscription | null = null;
  private tickerSub: Subscription | null = null;
  private visibilityHandler: (() => void) | null = null;
  private pollIntervalMs = environment.refreshIntervalMs;

  ngOnInit(): void {
    this.seo.update({
      title: 'Irrigação — Monitoramento',
      description: 'Estado atual das zonas de irrigação, umidade do solo e última ativação de bombas.',
      robots: 'noindex, nofollow',
    });
    this.fetchAllData();
    this.startPolling();
    this.tickerSub = timer(0, 1000).subscribe(() => this.now.set(Date.now()));

    if (isPlatformBrowser(this.platformId)) {
      timer(30_000, 30_000)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.nowTick.set(Date.now()));

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
    this.tickerSub?.unsubscribe();
    this.tickerSub = null;
    if (this.visibilityHandler && isPlatformBrowser(this.platformId)) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected fetchAllData(): void {
    this.loading.set(true);
    this.loadingEvolucao.set(true);
    this.error.set(false);
    this.errorEvolucao.set(false);

    forkJoin({
      summary: this.api.getIrrigationSummary().pipe(
        catchError(() => {
          this.error.set(true);
          return of(null as IrrigationSummaryResponse | null);
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
        next: ({ summary, medicoes }) => {
          if (summary !== null) {
            this.summary.set(summary);
            this.syncPollInterval(summary);
          }
          if (medicoes !== null) {
            this.medicoes.set(medicoes);
            if (isPlatformBrowser(this.platformId)) {
              this.atualizarChartSolo(medicoes);
            }
          }
          this.loading.set(false);
          this.loadingEvolucao.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.loadingEvolucao.set(false);
        },
      });
  }

  protected setData(d: string): void {
    if (this.dataSelecionada() === d) return;
    this.dataSelecionada.set(d);
    this.carregarEvolucao();
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
    this.carregarEvolucao();
  }

  protected tentarNovamenteEvolucao(): void {
    this.carregarEvolucao();
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

  protected activateManual(zone: 1 | 2): void {
    const ctrl = zone === 1 ? this.manualCtrl1 : this.manualCtrl2;
    const busy = zone === 1 ? this.manualBusy1 : this.manualBusy2;
    const msg = zone === 1 ? this.manualMsg1 : this.manualMsg2;

    ctrl.markAsTouched();
    if (ctrl.invalid || busy()) {
      return;
    }

    busy.set(true);
    msg.set(null);
    this.api.postIrrigationManual({ zone, duration_s: Math.trunc(ctrl.value) }).subscribe({
      next: () => {
        busy.set(false);
        msg.set({
          kind: 'success',
          text: 'Comando enviado. O painel mostrará "Bomba ativa" assim que o dispositivo iniciar (~1 min).',
        });
        this.fetchAllData();
      },
      error: (err) => {
        busy.set(false);
        msg.set({ kind: 'error', text: err?.error?.detail ?? 'Falha ao enviar comando.' });
        this.fetchAllData();
      },
    });
  }

  protected cancelManual(zone: 1 | 2): void {
    const busy = zone === 1 ? this.manualBusy1 : this.manualBusy2;
    const msg = zone === 1 ? this.manualMsg1 : this.manualMsg2;
    const pending =
      zone === 1 ? this.summary()?.zone_1.manual.pending : this.summary()?.zone_2.manual.pending;
    if (!pending || busy()) {
      return;
    }

    busy.set(true);
    msg.set(null);
    this.api.cancelIrrigationManual(pending.id).subscribe({
      next: () => {
        busy.set(false);
        msg.set({ kind: 'success', text: 'Comando cancelado.' });
        this.fetchAllData();
      },
      error: (err) => {
        busy.set(false);
        if (err?.status !== 409) {
          msg.set({ kind: 'error', text: err?.error?.detail ?? 'Falha ao cancelar comando.' });
        }
        this.fetchAllData();
      },
    });
  }

  protected remainingTime(expiresAt: string): string {
    const target = this.parseTimestamp(expiresAt);
    if (target === null) {
      return '--:--';
    }
    const remainingMs = Math.max(0, target - this.now());
    return this.formatDurationMs(remainingMs);
  }

  protected pumpRemainingTime(startedAt: string, durationS: number): string {
    const start = this.parseTimestamp(startedAt);
    if (start === null) {
      return '--:--';
    }
    const end = start + durationS * 1000;
    const remainingMs = Math.max(0, end - this.now());
    return this.formatDurationMs(remainingMs);
  }

  protected formatDateTime(value: string | null): string {
    if (!value) return '-';
    try {
      const withTz = value.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
      return new Date(withTz).toLocaleString('pt-BR', {
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

  private carregarEvolucao(): void {
    this.loadingEvolucao.set(true);
    this.errorEvolucao.set(false);
    this.api.getMedicoesPorData(this.dataSelecionada()).subscribe({
      next: (meds) => {
        this.medicoes.set(meds);
        if (isPlatformBrowser(this.platformId)) {
          this.atualizarChartSolo(meds);
        }
        this.loadingEvolucao.set(false);
      },
      error: () => {
        this.errorEvolucao.set(true);
        this.loadingEvolucao.set(false);
      },
    });
  }

  private atualizarChartSolo(meds: Medicao[]): void {
    const labels = meds.map((m) => this.formatarHora(m.created_at));

    const baseLine = {
      tension: 0.4,
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 6,
      spanGaps: true,
    } as const;

    const zone1Data = meds.map((m) => (isNum(m.umidade_solo_1) ? m.umidade_solo_1 : null)) as (
      | number
      | null
    )[];
    const zone2Data = meds.map((m) => (isNum(m.umidade_solo_2) ? m.umidade_solo_2 : null)) as (
      | number
      | null
    )[];

    const dsZone1: ChartDataset<'line'> = {
      ...baseLine,
      data: zone1Data,
      label: 'Zona 1',
      borderColor: COLOR_ZONE_1,
      backgroundColor: 'rgba(52, 211, 153, 0.18)',
      pointHoverBackgroundColor: COLOR_ZONE_1,
      fill: false,
    };

    const dsZone2: ChartDataset<'line'> = {
      ...baseLine,
      data: zone2Data,
      label: 'Zona 2',
      borderColor: COLOR_ZONE_2,
      backgroundColor: 'rgba(34, 211, 238, 0.18)',
      pointHoverBackgroundColor: COLOR_ZONE_2,
      fill: false,
    };

    this.chartDataSolo = { labels, datasets: [dsZone1, dsZone2] };
  }

  private buildChartOptions(): ChartConfiguration<'line'>['options'] {
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
          displayColors: true,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y;
              return v === null
                ? `${ctx.dataset.label}: -`
                : `${ctx.dataset.label}: ${formatDecimal(v, 0, 1)} %`;
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
          min: 0,
          max: 100,
          grid: { color: CHART_GRID },
          ticks: {
            color: CHART_TEXT,
            font: { size: 11 },
            callback: (value) => chartTickLabel(value, '%', 1),
          },
          border: { display: false },
        },
      },
    };
  }

  private buildManualControl(): FormControl<number> {
    return new FormControl<number>(30, {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.min(MANUAL_DURATION_MIN_S),
        Validators.max(MANUAL_DURATION_MAX_S),
      ],
    });
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

  private formatarHora(iso: string): string {
    try {
      const isoUtc = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
      return new Date(isoUtc).toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '-';
    }
  }

  private parseTimestamp(value: string): number | null {
    const withTz = value.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
    const ms = new Date(withTz).getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  private formatDurationMs(remainingMs: number): string {
    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  private hasActiveManualCommand(summary: IrrigationSummaryResponse | null): boolean {
    if (!summary) {
      return false;
    }
    return !!(
      summary.zone_1.manual.pending ||
      summary.zone_1.manual.running ||
      summary.zone_2.manual.pending ||
      summary.zone_2.manual.running
    );
  }

  private syncPollInterval(summary: IrrigationSummaryResponse): void {
    const nextMs = this.hasActiveManualCommand(summary)
      ? ACTIVE_MANUAL_POLL_MS
      : environment.refreshIntervalMs;
    if (nextMs === this.pollIntervalMs) {
      return;
    }
    this.pollIntervalMs = nextMs;
    this.startPolling();
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
}
