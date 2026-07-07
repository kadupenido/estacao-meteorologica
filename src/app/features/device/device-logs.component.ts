import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription, timer } from 'rxjs';

import { ApiService, type DeviceLog } from '../../core/services/api.service';
import { SeoService } from '../../core/services/seo.service';

const LOG_POLL_MS = 30_000;

@Component({
  selector: 'app-device-logs',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './device-logs.component.html',
  styleUrl: './device-logs.component.scss',
})
export class DeviceLogsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly seo = inject(SeoService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly logs = signal<DeviceLog[]>([]);
  protected readonly dataSelecionada = signal<string>(this.hoje());

  private pollingSub: Subscription | null = null;
  private visibilityHandler: (() => void) | null = null;

  ngOnInit(): void {
    this.seo.update({
      title: 'Logs do dispositivo',
      description: 'Linhas de log do firmware captura.',
      robots: 'noindex',
    });
    this.loadLogs();
    this.startPolling();

    if (isPlatformBrowser(this.platformId)) {
      this.visibilityHandler = () => {
        if (document.hidden) {
          this.stopPolling();
        } else {
          this.loadLogs();
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
  }

  protected isHoje(): boolean {
    return this.dataSelecionada() === this.hoje();
  }

  protected isOntem(): boolean {
    return this.dataSelecionada() === this.ontem();
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

  protected onDataInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) {
      this.setData(value);
    }
  }

  protected formatarDataCurta(yyyymmdd: string): string {
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    if (!y || !m || !d) return yyyymmdd;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  protected formatarHora(iso: string): string {
    try {
      const isoUtc = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
      return new Date(isoUtc).toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '-';
    }
  }

  protected tentarNovamente(): void {
    this.loadLogs();
  }

  private setData(d: string): void {
    if (this.dataSelecionada() === d) return;
    this.dataSelecionada.set(d);
    this.loadLogs();
    this.startPolling();
  }

  private loadLogs(): void {
    this.loading.set(true);
    this.error.set(false);

    const request = this.isHoje()
      ? this.api.getDeviceLogsRecent()
      : this.api.getDeviceLogsPorData(this.dataSelecionada());

    request.subscribe({
      next: (rows) => {
        this.logs.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  private startPolling(): void {
    this.stopPolling();
    if (!this.isHoje() || !isPlatformBrowser(this.platformId)) {
      return;
    }
    this.pollingSub = timer(LOG_POLL_MS, LOG_POLL_MS).subscribe(() => this.loadLogsQuietly());
  }

  private stopPolling(): void {
    this.pollingSub?.unsubscribe();
    this.pollingSub = null;
  }

  private loadLogsQuietly(): void {
    this.api.getDeviceLogsRecent().subscribe({
      next: (rows) => this.logs.set(rows),
      error: () => {},
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
}
