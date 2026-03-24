import { Component, OnInit, OnDestroy, signal, inject, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { timer, switchMap, Subject, takeUntil, forkJoin, of, catchError } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartDataset } from 'chart.js';

import { ApiService } from '../../core/services/api.service';
import { adcParaMm } from '../../core/utils/precipitacao-mm';
import { environment } from '../../../environments/environment';
import type { Medicao } from '../../shared/models/medicao.model';
import type { Previsao } from '../../shared/models/previsao.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DecimalPipe, FormsModule, BaseChartDirective],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly destroy$ = new Subject<void>();

  protected medicao = signal<Medicao | null>(null);
  protected previsao = signal<Previsao | null>(null);
  protected loadingDados = signal(true);
  protected loadingPrevisao = signal(true);
  protected errorDados = signal(false);
  protected errorPrevisao = signal(false);

  protected dataSelecionada = signal<string>(this.hoje());
  protected medicoes = signal<Medicao[]>([]);
  protected loadingEvolucao = signal(false);
  protected errorEvolucao = signal(false);

  protected maxMin = computed(() => {
    const m = this.medicoes();
    if (m.length === 0) return null;
    const temps = m.map((x) => x.temperatura);
    const umids = m.map((x) => x.umidade);
    const press = m.map((x) => x.pressao);
    const precs = m.map((x) =>
      adcParaMm(x.precipitacao, environment.rainPowerA, environment.rainPowerB),
    );
    return {
      tempMin: Math.min(...temps),
      tempMax: Math.max(...temps),
      umidMin: Math.min(...umids),
      umidMax: Math.max(...umids),
      pressMin: Math.min(...press),
      pressMax: Math.max(...press),
      precipMin: Math.min(...precs),
      precipMax: Math.max(...precs),
    };
  });

  protected chartOptions: ChartConfiguration['options'] = {
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
          color: 'var(--text-muted)',
          maxTicksLimit: 8,
          font: { size: 11 },
        },
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: 'var(--text-muted)',
          font: { size: 11 },
        },
        border: { display: false },
      },
    },
  };

  protected chartDataTemp: ChartConfiguration['data'] = { labels: [], datasets: [] };
  protected chartDataUmid: ChartConfiguration['data'] = { labels: [], datasets: [] };
  protected chartDataPress: ChartConfiguration['data'] = { labels: [], datasets: [] };
  protected chartDataPrecip: ChartConfiguration['data'] = { labels: [], datasets: [] };

  ngOnInit(): void {
    timer(0, environment.refreshIntervalMs)
      .pipe(
        switchMap(() => {
          this.loadingDados.set(true);
          this.loadingPrevisao.set(true);
          this.loadingEvolucao.set(true);
          this.errorDados.set(false);
          this.errorPrevisao.set(false);
          this.errorEvolucao.set(false);
          return forkJoin({
            medicao: this.api.getUltimaMedicao().pipe(
              catchError(() => {
                this.errorDados.set(true);
                return of(null as Medicao | null);
              }),
            ),
            previsao: this.api.getPrevisao().pipe(
              catchError(() => {
                this.errorPrevisao.set(true);
                return of(null as Previsao | null);
              }),
            ),
            medicoes: this.api.getMedicoesPorData(this.dataSelecionada()).pipe(
              catchError(() => {
                this.errorEvolucao.set(true);
                return of(null as Medicao[] | null);
              }),
            ),
          });
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: ({ medicao, previsao, medicoes }) => {
          if (medicao !== null) this.medicao.set(medicao);
          if (previsao !== null) this.previsao.set(previsao);
          if (medicoes !== null) {
            this.medicoes.set(medicoes);
            this.atualizarCharts(medicoes);
          }
          this.loadingDados.set(false);
          this.loadingPrevisao.set(false);
          this.loadingEvolucao.set(false);
        },
        error: () => {
          this.loadingDados.set(false);
          this.loadingPrevisao.set(false);
          this.loadingEvolucao.set(false);
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private hoje(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  }

  protected onDataChange(): void {
    this.carregar();
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

    const dsTemp: ChartDataset<'line'> = {
      data: meds.map((m) => m.temperatura),
      label: 'Temperatura (°C)',
      borderColor: '#22d3ee',
      backgroundColor: 'rgba(34, 211, 238, 0.2)',
      fill: true,
      tension: 0.4,
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: '#22d3ee',
    };
    const dsUmid: ChartDataset<'line'> = {
      data: meds.map((m) => m.umidade),
      label: 'Umidade (%)',
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.2)',
      fill: true,
      tension: 0.4,
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: '#3b82f6',
    };
    const dsPress: ChartDataset<'line'> = {
      data: meds.map((m) => m.pressao),
      label: 'Pressão (hPa)',
      borderColor: '#a78bfa',
      backgroundColor: 'rgba(167, 139, 250, 0.2)',
      fill: true,
      tension: 0.4,
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: '#a78bfa',
    };
    const dsPrecip: ChartDataset<'line'> = {
      data: meds.map((m) =>
        adcParaMm(m.precipitacao, environment.rainPowerA, environment.rainPowerB),
      ),
      label: 'Precipitação (mm)',
      borderColor: '#38bdf8',
      backgroundColor: 'rgba(56, 189, 248, 0.25)',
      fill: true,
      tension: 0.4,
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: '#38bdf8',
    };

    this.chartDataTemp = { labels, datasets: [dsTemp] };
    this.chartDataUmid = { labels, datasets: [dsUmid] };
    this.chartDataPress = { labels, datasets: [dsPress] };
    this.chartDataPrecip = { labels, datasets: [dsPrecip] };
  }

  private formatarHora(iso: string): string {
    try {
      const isoUtc = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
      const d = new Date(isoUtc);
      return d.toLocaleTimeString('pt-BR', {
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
      const isoUtc = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
      const d = new Date(isoUtc);
      return d.toLocaleString('pt-BR', {
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

  protected probPercent(prob: number): number {
    return Math.round(prob * 100);
  }

  /** Mesma conversão ADC→mm usada em api/app/ml/preprocessing.py antes do modelo. */
  protected precipitacaoMm(valorAdc: number): number {
    return adcParaMm(valorAdc, environment.rainPowerA, environment.rainPowerB);
  }
}
