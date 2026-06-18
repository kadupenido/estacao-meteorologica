import {
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, forkJoin, timer } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartDataset } from 'chart.js';

import {
  ApiService,
  type ControleUmidadeMedicao,
  type ControleUmidadeResumo,
} from '../../core/services/api.service';
import { SeoService } from '../../core/services/seo.service';
import { environment } from '../../../environments/environment';
import { chartTickLabel, formatDecimal } from '../../core/utils/format-locale';

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const CHART_TEXT = '#8a96a0';
const CHART_GRID = 'rgba(128, 128, 128, 0.18)';
const COLOR_TEMP = '#22d3ee';
const COLOR_UMID = '#34d399';
const COLOR_VOLTAGE = '#fbbf24';
const COLOR_CURRENT = '#60a5fa';

@Component({
  selector: 'app-controle-umidade',
  standalone: true,
  imports: [DecimalPipe, ReactiveFormsModule, BaseChartDirective],
  templateUrl: './controle-umidade.component.html',
  styleUrl: './controle-umidade.component.scss',
})
export class ControleUmidadeComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly seo = inject(SeoService);
  private readonly fb = inject(FormBuilder);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saveSuccess = signal<string | null>(null);
  protected readonly resumo = signal<ControleUmidadeResumo | null>(null);

  protected readonly dataSelecionada = signal<string>(this.hoje());
  protected readonly medicoes = signal<ControleUmidadeMedicao[]>([]);
  protected readonly loadingEvolucao = signal(false);
  protected readonly errorEvolucao = signal(false);

  protected readonly isHoje = computed(() => this.dataSelecionada() === this.hoje());
  protected readonly isOntem = computed(() => this.dataSelecionada() === this.ontem());

  protected readonly form = this.fb.nonNullable.group({
    active: [true],
    setpoint_pct: [55, [Validators.required, Validators.min(0), Validators.max(100)]],
    hysteresis_pct: [3, [Validators.required, Validators.min(0)]],
    fan_max_duration_s: [300, [Validators.required, Validators.min(0)]],
  });

  protected chartDataClima: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  protected chartDataUmid: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  protected chartDataVoltage: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  protected chartDataCurrent: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };

  protected chartOptionsClima: ChartConfiguration<'line'>['options'] = this.buildClimaOptions();
  protected chartOptionsUmid: ChartConfiguration<'line'>['options'] = this.buildSingleOptions('%', 1);
  protected chartOptionsVoltage: ChartConfiguration<'line'>['options'] = this.buildSingleOptions('V', 2);
  protected chartOptionsCurrent: ChartConfiguration<'line'>['options'] = this.buildSingleOptions('mA', 0);

  private pollingSub: Subscription | null = null;
  private pollIntervalMs = environment.refreshIntervalMs;

  ngOnInit(): void {
    this.seo.update({
      title: 'Controle de umidade',
      description: 'Monitoramento de temperatura e umidade ambiente, energia e configuração do ventilador.',
      robots: 'noindex, nofollow',
    });
    this.reload();
    this.carregarEvolucao();
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.pollingSub?.unsubscribe();
    this.pollingSub = null;
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(false);
    forkJoin({
      resumo: this.api.getControleUmidadeResumo(),
      config: this.api.getControleUmidadeConfig(),
    }).subscribe({
      next: ({ resumo, config }) => {
        this.resumo.set(resumo);
        this.form.patchValue({
          active: config.active,
          setpoint_pct: config.setpoint_pct,
          hysteresis_pct: config.hysteresis_pct,
          fan_max_duration_s: config.fan_max_duration_s,
        });
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  protected setActive(active: boolean): void {
    this.form.controls.active.setValue(active);
    this.saveError.set(null);
    this.saveSuccess.set(null);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Revise os valores antes de salvar.');
      this.saveSuccess.set(null);
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(null);
    const v = this.form.getRawValue();
    this.api.putControleUmidadeConfig(v).subscribe({
      next: () => {
        this.saving.set(false);
        this.saveSuccess.set('Configurações salvas.');
        this.reload();
      },
      error: () => {
        this.saving.set(false);
        this.saveError.set('Não foi possível salvar as configurações.');
      },
    });
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

  protected formatDateTime(iso: string | null): string {
    if (!iso) return '-';
    try {
      const normalized = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
      return new Date(normalized).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  protected formatarDataCurta(yyyymmdd: string): string {
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString('pt-BR', {
      timeZone: 'UTC',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  }

  protected formatCorrente(a: number | null): string {
    if (!isNum(a)) return '-';
    if (a < 1) return `${formatDecimal(a * 1000, 0, 0)} mA`;
    return `${formatDecimal(a, 2, 2)} A`;
  }

  private startPolling(): void {
    this.pollingSub?.unsubscribe();
    this.pollingSub = timer(this.pollIntervalMs, this.pollIntervalMs).subscribe(() => {
      this.api.getControleUmidadeResumo().subscribe({
        next: (r) => this.resumo.set(r),
      });
    });
  }

  private setData(d: string): void {
    if (this.dataSelecionada() === d) return;
    this.dataSelecionada.set(d);
    this.carregarEvolucao();
  }

  private carregarEvolucao(): void {
    this.loadingEvolucao.set(true);
    this.errorEvolucao.set(false);
    this.api.getControleUmidadePorData(this.dataSelecionada()).subscribe({
      next: (meds) => {
        this.medicoes.set(meds);
        if (isPlatformBrowser(this.platformId)) {
          this.atualizarCharts(meds);
        }
        this.loadingEvolucao.set(false);
      },
      error: () => {
        this.errorEvolucao.set(true);
        this.loadingEvolucao.set(false);
      },
    });
  }

  private atualizarCharts(meds: ControleUmidadeMedicao[]): void {
    const labels = meds.map((m) => this.formatarHora(m.created_at));
    const baseLine = {
      tension: 0.4,
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 6,
      spanGaps: true,
    } as const;

    const tempData = meds.map((m) => (isNum(m.temperatura) ? m.temperatura : null));
    const umidData = meds.map((m) => (isNum(m.umidade) ? m.umidade : null));
    const voltData = meds.map((m) => (isNum(m.tensao_sistema) ? m.tensao_sistema : null));
    const currData = meds.map((m) =>
      isNum(m.corrente_sistema) ? m.corrente_sistema * 1000 : null,
    );

    const dsTemp: ChartDataset<'line'> = {
      ...baseLine,
      data: tempData,
      label: 'Temperatura',
      borderColor: COLOR_TEMP,
      backgroundColor: 'rgba(34, 211, 238, 0.18)',
      pointHoverBackgroundColor: COLOR_TEMP,
      fill: false,
    };
    const dsUmid: ChartDataset<'line'> = {
      ...baseLine,
      data: umidData,
      label: 'Umidade',
      borderColor: COLOR_UMID,
      backgroundColor: 'rgba(52, 211, 153, 0.18)',
      pointHoverBackgroundColor: COLOR_UMID,
      fill: false,
    };
    const dsVolt: ChartDataset<'line'> = {
      ...baseLine,
      data: voltData,
      label: 'Tensão',
      borderColor: COLOR_VOLTAGE,
      backgroundColor: 'rgba(251, 191, 36, 0.18)',
      pointHoverBackgroundColor: COLOR_VOLTAGE,
      fill: false,
    };
    const dsCurr: ChartDataset<'line'> = {
      ...baseLine,
      data: currData,
      label: 'Corrente',
      borderColor: COLOR_CURRENT,
      backgroundColor: 'rgba(96, 165, 250, 0.18)',
      pointHoverBackgroundColor: COLOR_CURRENT,
      fill: false,
    };

    this.chartDataClima = {
      labels,
      datasets: [
        { ...dsTemp, yAxisID: 'y' },
        { ...dsUmid, yAxisID: 'y1' },
      ],
    };
    this.chartDataUmid = { labels, datasets: [dsUmid] };
    this.chartDataVoltage = { labels, datasets: [dsVolt] };
    this.chartDataCurrent = { labels, datasets: [dsCurr] };
  }

  private buildSingleOptions(yUnit: string, maxFrac: number): ChartConfiguration<'line'>['options'] {
    return {
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

  private buildClimaOptions(): ChartConfiguration<'line'>['options'] {
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
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: CHART_TEXT, maxTicksLimit: 8, font: { size: 11 } },
        },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: '°C', color: CHART_TEXT },
          grid: { color: CHART_GRID },
          ticks: { color: CHART_TEXT, font: { size: 11 } },
          border: { display: false },
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: '%', color: CHART_TEXT },
          grid: { drawOnChartArea: false },
          ticks: { color: CHART_TEXT, font: { size: 11 } },
          border: { display: false },
        },
      },
    };
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
      const normalized = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
      return new Date(normalized).toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }
}
