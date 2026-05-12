import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  ApiService,
  type IrrigationConfigResponse,
  type IrrigationZoneConfig,
} from '../../core/services/api.service';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-irrigation-settings',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './irrigation-settings.component.html',
  styleUrl: './irrigation-settings.component.scss',
})
export class IrrigationSettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly seo = inject(SeoService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    zone_1: this.fb.nonNullable.group({
      active: [true],
      threshold_pct: [35, [Validators.required, Validators.min(0), Validators.max(100)]],
      pump_duration_s: [10, [Validators.required, Validators.min(0)]],
      hysteresis_pct: [5, [Validators.required, Validators.min(0)]],
    }),
    zone_2: this.fb.nonNullable.group({
      active: [true],
      threshold_pct: [35, [Validators.required, Validators.min(0), Validators.max(100)]],
      pump_duration_s: [10, [Validators.required, Validators.min(0)]],
      hysteresis_pct: [5, [Validators.required, Validators.min(0)]],
    }),
  });

  ngOnInit(): void {
    this.seo.update({
      title: 'Irrigação — Configurações',
      description: 'Ajuste limiar de umidade, histerese e tempo de ativação das bombas de irrigação.',
      robots: 'noindex, nofollow',
    });
    this.loadConfig();
  }

  protected loadConfig(): void {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    this.api.getIrrigationConfig().subscribe({
      next: (cfg) => {
        this.patchZone('zone_1', cfg.zone_1);
        this.patchZone('zone_2', cfg.zone_2);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Não foi possível carregar as configurações.');
        this.loading.set(false);
      },
    });
  }

  protected setZoneActive(zone: 'zone_1' | 'zone_2', active: boolean): void {
    this.form.controls[zone].controls.active.setValue(active);
    this.error.set(null);
    this.success.set(null);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revise os valores antes de salvar.');
      this.success.set(null);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.success.set(null);

    const payload: IrrigationConfigResponse = {
      zone_1: { zone: 1, ...this.form.controls.zone_1.getRawValue() },
      zone_2: { zone: 2, ...this.form.controls.zone_2.getRawValue() },
    };

    this.api.putIrrigationConfig(payload).subscribe({
      next: (saved) => {
        this.patchZone('zone_1', saved.zone_1);
        this.patchZone('zone_2', saved.zone_2);
        this.saving.set(false);
        this.success.set('Configurações salvas com sucesso.');
      },
      error: () => {
        this.saving.set(false);
        this.error.set('Falha ao salvar as configurações.');
      },
    });
  }

  private patchZone(key: 'zone_1' | 'zone_2', zone: IrrigationZoneConfig): void {
    this.form.controls[key].patchValue({
      active: zone.active,
      threshold_pct: zone.threshold_pct,
      pump_duration_s: zone.pump_duration_s,
      hysteresis_pct: zone.hysteresis_pct,
    });
  }
}
