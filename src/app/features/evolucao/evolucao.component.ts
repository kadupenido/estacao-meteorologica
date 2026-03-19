import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartDataset } from 'chart.js';

import { ApiService } from '../../core/services/api.service';
import type { Medicao } from '../../shared/models/medicao.model';

@Component({
  selector: 'app-evolucao',
  standalone: true,
  imports: [FormsModule, DecimalPipe, RouterLink, BaseChartDirective],
  templateUrl: './evolucao.component.html',
  styleUrl: './evolucao.component.scss',
})
export class EvolucaoComponent implements OnInit {
  private readonly api = inject(ApiService);

  protected dataSelecionada = signal<string>(this.hoje());
  protected medicoes = signal<Medicao[]>([]);
  protected loading = signal(false);
  protected error = signal(false);

  protected maxMin = computed(() => {
    const m = this.medicoes();
    if (m.length === 0) return null;
    const temps = m.map((x) => x.temperatura);
    const umids = m.map((x) => x.umidade);
    const press = m.map((x) => x.pressao);
    return {
      tempMin: Math.min(...temps),
      tempMax: Math.max(...temps),
      umidMin: Math.min(...umids),
      umidMax: Math.max(...umids),
      pressMin: Math.min(...press),
      pressMax: Math.max(...press),
    };
  });

  protected chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.08)' },
        ticks: { color: 'var(--text-muted)', maxTicksLimit: 12 },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.08)' },
        ticks: { color: 'var(--text-muted)' },
      },
    },
  };

  protected chartDataTemp: ChartConfiguration['data'] = { labels: [], datasets: [] };
  protected chartDataUmid: ChartConfiguration['data'] = { labels: [], datasets: [] };
  protected chartDataPress: ChartConfiguration['data'] = { labels: [], datasets: [] };

  ngOnInit(): void {
    this.carregar();
  }

  private hoje(): string {
    return new Date().toISOString().slice(0, 10);
  }

  protected onDataChange(): void {
    this.carregar();
  }

  private carregar(): void {
    const data = this.dataSelecionada();
    this.loading.set(true);
    this.error.set(false);
    this.api.getMedicoesPorData(data).subscribe({
      next: (meds) => {
        this.medicoes.set(meds);
        this.atualizarCharts(meds);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  private atualizarCharts(meds: Medicao[]): void {
    const labels = meds.map((m) => this.formatarHora(m.created_at));

    const dsTemp: ChartDataset<'line'> = {
      data: meds.map((m) => m.temperatura),
      label: 'Temperatura (°C)',
      borderColor: '#22d3ee',
      backgroundColor: 'rgba(34, 211, 238, 0.1)',
      fill: true,
      tension: 0.3,
    };
    const dsUmid: ChartDataset<'line'> = {
      data: meds.map((m) => m.umidade),
      label: 'Umidade (%)',
      borderColor: '#67e8f9',
      backgroundColor: 'rgba(103, 232, 249, 0.1)',
      fill: true,
      tension: 0.3,
    };
    const dsPress: ChartDataset<'line'> = {
      data: meds.map((m) => m.pressao),
      label: 'Pressão (hPa)',
      borderColor: '#a5f3fc',
      backgroundColor: 'rgba(165, 243, 252, 0.1)',
      fill: true,
      tension: 0.3,
    };

    this.chartDataTemp = { labels, datasets: [dsTemp] };
    this.chartDataUmid = { labels, datasets: [dsUmid] };
    this.chartDataPress = { labels, datasets: [dsPress] };
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
}
