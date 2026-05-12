import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription, timer } from 'rxjs';

import { ApiService, type IrrigationSummaryResponse } from '../../core/services/api.service';
import { SeoService } from '../../core/services/seo.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-irrigation-monitor',
  standalone: true,
  imports: [DecimalPipe, RouterLink],
  templateUrl: './irrigation-monitor.component.html',
  styleUrl: './irrigation-monitor.component.scss',
})
export class IrrigationMonitorComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly seo = inject(SeoService);

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly summary = signal<IrrigationSummaryResponse | null>(null);

  private pollingSub: Subscription | null = null;

  ngOnInit(): void {
    this.seo.update({
      title: 'Irrigação — Monitoramento',
      description: 'Estado atual das zonas de irrigação, umidade do solo e última ativação de bombas.',
      robots: 'noindex, nofollow',
    });
    this.reload();
    this.pollingSub = timer(environment.refreshIntervalMs, environment.refreshIntervalMs).subscribe(() =>
      this.reload(),
    );
  }

  ngOnDestroy(): void {
    this.pollingSub?.unsubscribe();
    this.pollingSub = null;
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.getIrrigationSummary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
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
}
