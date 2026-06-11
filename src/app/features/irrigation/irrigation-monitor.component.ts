import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, timer } from 'rxjs';

import { ApiService, type IrrigationSummaryResponse } from '../../core/services/api.service';
import { SeoService } from '../../core/services/seo.service';
import { environment } from '../../../environments/environment';

const MANUAL_DURATION_MIN_S = 1;
const MANUAL_DURATION_MAX_S = 600;
const ACTIVE_MANUAL_POLL_MS = 20_000;

interface ManualFeedback {
  kind: 'success' | 'error';
  text: string;
}

@Component({
  selector: 'app-irrigation-monitor',
  standalone: true,
  imports: [DecimalPipe, RouterLink, ReactiveFormsModule],
  templateUrl: './irrigation-monitor.component.html',
  styleUrl: './irrigation-monitor.component.scss',
})
export class IrrigationMonitorComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly seo = inject(SeoService);

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly summary = signal<IrrigationSummaryResponse | null>(null);

  protected readonly manualCtrl1 = this.buildManualControl();
  protected readonly manualCtrl2 = this.buildManualControl();
  protected readonly manualBusy1 = signal(false);
  protected readonly manualBusy2 = signal(false);
  protected readonly manualMsg1 = signal<ManualFeedback | null>(null);
  protected readonly manualMsg2 = signal<ManualFeedback | null>(null);

  protected readonly now = signal(Date.now());

  private pollingSub: Subscription | null = null;
  private tickerSub: Subscription | null = null;
  private pollIntervalMs = environment.refreshIntervalMs;

  ngOnInit(): void {
    this.seo.update({
      title: 'Irrigação — Monitoramento',
      description: 'Estado atual das zonas de irrigação, umidade do solo e última ativação de bombas.',
      robots: 'noindex, nofollow',
    });
    this.reload();
    this.startPolling();
    this.tickerSub = timer(0, 1000).subscribe(() => this.now.set(Date.now()));
  }

  ngOnDestroy(): void {
    this.pollingSub?.unsubscribe();
    this.pollingSub = null;
    this.tickerSub?.unsubscribe();
    this.tickerSub = null;
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.getIrrigationSummary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
        this.syncPollInterval(summary);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
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
        this.reload();
      },
      error: (err) => {
        busy.set(false);
        msg.set({ kind: 'error', text: err?.error?.detail ?? 'Falha ao enviar comando.' });
        this.reload();
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
        this.reload();
      },
      error: (err) => {
        busy.set(false);
        // 409: o estado mudou no servidor (executado/expirado) — o reload resolve.
        if (err?.status !== 409) {
          msg.set({ kind: 'error', text: err?.error?.detail ?? 'Falha ao cancelar comando.' });
        }
        this.reload();
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
    this.pollingSub?.unsubscribe();
    this.pollingSub = timer(this.pollIntervalMs, this.pollIntervalMs).subscribe(() => this.reload());
  }
}
