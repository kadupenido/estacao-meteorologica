import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { timer, switchMap, Subject, takeUntil } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { DADOS_REFRESH_INTERVAL_MS } from '../../core/constants/dados-refresh';
import { adcParaMm } from '../../core/utils/precipitacao-mm';
import { environment } from '../../../environments/environment';
import type { Medicao } from '../../shared/models/medicao.model';
import type { Previsao } from '../../shared/models/previsao.model';

const PREVISAO_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DecimalPipe, RouterLink],
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

  ngOnInit(): void {
    timer(0, DADOS_REFRESH_INTERVAL_MS)
      .pipe(
        switchMap(() => {
          this.loadingDados.set(true);
          this.errorDados.set(false);
          return this.api.getUltimaMedicao();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (m) => {
          this.medicao.set(m);
          this.loadingDados.set(false);
        },
        error: () => {
          this.errorDados.set(true);
          this.loadingDados.set(false);
        },
      });

    timer(0, PREVISAO_INTERVAL_MS)
      .pipe(
        switchMap(() => {
          this.loadingPrevisao.set(true);
          this.errorPrevisao.set(false);
          return this.api.getPrevisao();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (p) => {
          this.previsao.set(p);
          this.loadingPrevisao.set(false);
        },
        error: () => {
          this.errorPrevisao.set(true);
          this.loadingPrevisao.set(false);
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected formatarData(iso: string): string {
    try {
      // API retorna UTC sem sufixo Z; sem Z, JS interpreta como hora local
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
