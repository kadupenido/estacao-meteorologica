import { Component, OnInit, OnDestroy, PLATFORM_ID, signal, inject, computed } from '@angular/core';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { timer, Subject, takeUntil, forkJoin, of, catchError, Subscription } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartDataset } from 'chart.js';

import { ApiService } from '../../core/services/api.service';
import { SeoService } from '../../core/services/seo.service';
import { JsonLdService } from '../../core/services/json-ld.service';
import { environment } from '../../../environments/environment';
import type { Medicao } from '../../shared/models/medicao.model';

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function avg(...vals: Array<number | null | undefined>): number | null {
  const nums = vals.filter(isNum);
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function pickTemp(m: Medicao): number | null {
  return avg(m.temperatura_bme, m.temperatura_sht) ?? m.temperatura ?? null;
}

function pickHum(m: Medicao): number | null {
  return avg(m.umidade_bme, m.umidade_sht) ?? m.umidade ?? null;
}

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

  protected isHoje = computed(() => this.dataSelecionada() === this.hoje());

  protected readonly location = environment.location;
  protected readonly batteryWarn = environment.batteryWarnVoltage;
  protected readonly batteryDanger = environment.batteryDangerVoltage;

  protected activeTab = signal<'todos' | 'ambiente' | 'sistema'>('todos');

  private pollingSub: Subscription | null = null;
  private visibilityHandler: (() => void) | null = null;

  protected current = computed(() => {
    const m = this.medicao();
    if (!m) return null;
    return {
      tempAvg: pickTemp(m),
      umidAvg: pickHum(m),
      pressao: m.pressao,
      tensao_bateria: m.tensao_bateria,
      tensao_painel: m.tensao_painel,
      created_at: m.created_at,
    };
  });

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
      temp: delta(pickTemp(cur), pickTemp(prev)),
      umid: delta(pickHum(cur), pickHum(prev)),
      pressao: delta(cur.pressao, prev.pressao),
      bateria: delta(cur.tensao_bateria, prev.tensao_bateria),
      painel: delta(cur.tensao_painel, prev.tensao_painel),
    };
  });

  protected batteryStatus = computed<'ok' | 'warn' | 'danger'>(() => {
    const v = this.medicao()?.tensao_bateria;
    if (!isNum(v)) return 'ok';
    if (v < this.batteryDanger) return 'danger';
    if (v < this.batteryWarn) return 'warn';
    return 'ok';
  });

  protected maxMin = computed(() => {
    const m = this.medicoes();
    if (m.length === 0) return null;

    const allTemps = m.flatMap((x) => [x.temperatura_bme, x.temperatura_sht, x.temperatura]).filter(isNum);
    const allUmids = m.flatMap((x) => [x.umidade_bme, x.umidade_sht, x.umidade]).filter(isNum);
    const allPress = m.map((x) => x.pressao).filter(isNum);
    const allBat = m.map((x) => x.tensao_bateria).filter(isNum);
    const allPainel = m.map((x) => x.tensao_painel).filter(isNum);

    return {
      tempMin: allTemps.length ? Math.min(...allTemps) : null,
      tempMax: allTemps.length ? Math.max(...allTemps) : null,
      umidMin: allUmids.length ? Math.min(...allUmids) : null,
      umidMax: allUmids.length ? Math.max(...allUmids) : null,
      pressMin: allPress.length ? Math.min(...allPress) : null,
      pressMax: allPress.length ? Math.max(...allPress) : null,
      batMin: allBat.length ? Math.min(...allBat) : null,
      batMax: allBat.length ? Math.max(...allBat) : null,
      painelMin: allPainel.length ? Math.min(...allPainel) : null,
      painelMax: allPainel.length ? Math.max(...allPainel) : null,
    };
  });

  private readonly baseChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
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
        ticks: {
          color: '#a8b3b8',
          maxTicksLimit: 8,
          font: { size: 11 },
        },
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: '#a8b3b8',
          font: { size: 11 },
        },
        border: { display: false },
      },
    },
  };

  protected chartOptions: ChartConfiguration['options'] = this.baseChartOptions;

  protected chartOptionsMulti: ChartConfiguration['options'] = {
    ...this.baseChartOptions,
    plugins: {
      ...this.baseChartOptions!.plugins,
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          color: '#a8b3b8',
          boxWidth: 12,
          boxHeight: 12,
          padding: 12,
          font: { size: 12 },
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
    },
  };

  protected chartDataTemp: ChartConfiguration['data'] = { labels: [], datasets: [] };
  protected chartDataUmid: ChartConfiguration['data'] = { labels: [], datasets: [] };
  protected chartDataPress: ChartConfiguration['data'] = { labels: [], datasets: [] };
  protected chartDataBat: ChartConfiguration['data'] = { labels: [], datasets: [] };
  protected chartDataSolar: ChartConfiguration['data'] = { labels: [], datasets: [] };

  ngOnInit(): void {
    this.seo.update({
      title: 'Monitor Ambiental — Dados em Tempo Real',
      description:
        'Monitoramento em tempo real de temperatura, umidade, pressão atmosférica, tensão da bateria e do painel solar, com evolução diária e gráficos.',
      keywords:
        'monitor ambiental, temperatura, umidade, pressão atmosférica, bateria, painel solar, sensores, dados ambientais',
    });

    this.jsonLd.setWebApplication();

    this.fetchAllData();

    if (isPlatformBrowser(this.platformId)) {
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
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollingSub = timer(environment.refreshIntervalMs, environment.refreshIntervalMs)
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

  private addDays(yyyymmdd: string, n: number): string {
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + n);
    const yy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  protected diaAnterior(): void {
    this.dataSelecionada.set(this.addDays(this.dataSelecionada(), -1));
    this.carregar();
  }

  protected diaSeguinte(): void {
    if (this.isHoje()) return;
    this.dataSelecionada.set(this.addDays(this.dataSelecionada(), 1));
    this.carregar();
  }

  protected onDataChange(): void {
    this.carregar();
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

  private atualizarCharts(meds: Medicao[]): void {
    const labels = meds.map((m) => this.formatarHora(m.created_at));

    const baseLine = {
      tension: 0.4,
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 6,
      spanGaps: true,
    } as const;

    const dsTempBme: ChartDataset<'line'> = {
      ...baseLine,
      data: meds.map((m) =>
        isNum(m.temperatura_bme) ? m.temperatura_bme : isNum(m.temperatura) ? m.temperatura : null,
      ) as (number | null)[],
      label: 'BME280',
      borderColor: '#22d3ee',
      backgroundColor: 'rgba(34, 211, 238, 0.2)',
      pointHoverBackgroundColor: '#22d3ee',
      fill: false,
    };
    const dsTempSht: ChartDataset<'line'> = {
      ...baseLine,
      data: meds.map((m) => (isNum(m.temperatura_sht) ? m.temperatura_sht : null)) as (number | null)[],
      label: 'SHT31',
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.2)',
      pointHoverBackgroundColor: '#f59e0b',
      fill: false,
    };

    const dsUmidBme: ChartDataset<'line'> = {
      ...baseLine,
      data: meds.map((m) =>
        isNum(m.umidade_bme) ? m.umidade_bme : isNum(m.umidade) ? m.umidade : null,
      ) as (number | null)[],
      label: 'BME280',
      borderColor: '#22d3ee',
      backgroundColor: 'rgba(34, 211, 238, 0.2)',
      pointHoverBackgroundColor: '#22d3ee',
      fill: false,
    };
    const dsUmidSht: ChartDataset<'line'> = {
      ...baseLine,
      data: meds.map((m) => (isNum(m.umidade_sht) ? m.umidade_sht : null)) as (number | null)[],
      label: 'SHT31',
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.2)',
      pointHoverBackgroundColor: '#f59e0b',
      fill: false,
    };

    const dsPress: ChartDataset<'line'> = {
      ...baseLine,
      data: meds.map((m) => (isNum(m.pressao) ? m.pressao : null)) as (number | null)[],
      label: 'Pressão (hPa)',
      borderColor: '#a78bfa',
      backgroundColor: 'rgba(167, 139, 250, 0.2)',
      pointHoverBackgroundColor: '#a78bfa',
      fill: true,
    };

    const dsBat: ChartDataset<'line'> = {
      ...baseLine,
      data: meds.map((m) => (isNum(m.tensao_bateria) ? m.tensao_bateria : null)) as (number | null)[],
      label: 'Bateria (V)',
      borderColor: '#34d399',
      backgroundColor: 'rgba(52, 211, 153, 0.2)',
      pointHoverBackgroundColor: '#34d399',
      fill: true,
    };

    const dsSolar: ChartDataset<'line'> = {
      ...baseLine,
      data: meds.map((m) => (isNum(m.tensao_painel) ? m.tensao_painel : null)) as (number | null)[],
      label: 'Painel solar (V)',
      borderColor: '#fbbf24',
      backgroundColor: 'rgba(251, 191, 36, 0.2)',
      pointHoverBackgroundColor: '#fbbf24',
      fill: true,
    };

    this.chartDataTemp = { labels, datasets: [dsTempBme, dsTempSht] };
    this.chartDataUmid = { labels, datasets: [dsUmidBme, dsUmidSht] };
    this.chartDataPress = { labels, datasets: [dsPress] };
    this.chartDataBat = { labels, datasets: [dsBat] };
    this.chartDataSolar = { labels, datasets: [dsSolar] };
  }

  private toUtcIso(iso: string): string {
    return iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  }

  private formatarHora(iso: string): string {
    try {
      return new Date(this.toUtcIso(iso)).toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '-';
    }
  }

  protected tentarNovamente(): void {
    this.carregar();
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

  protected setTab(tab: 'todos' | 'ambiente' | 'sistema'): void {
    this.activeTab.set(tab);
  }
}
