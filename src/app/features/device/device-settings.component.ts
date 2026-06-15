import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  ApiService,
  type DeviceConfig,
  type DeviceConfigInput,
} from '../../core/services/api.service';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-device-settings',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './device-settings.component.html',
  styleUrl: './device-settings.component.scss',
})
export class DeviceSettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly seo = inject(SeoService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly lastUpdated = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    soil1_dry_mv: [2600, [Validators.required, Validators.min(1), Validators.max(5000)]],
    soil1_wet_mv: [1200, [Validators.required, Validators.min(1), Validators.max(5000)]],
    soil2_dry_mv: [2600, [Validators.required, Validators.min(1), Validators.max(5000)]],
    soil2_wet_mv: [1200, [Validators.required, Validators.min(1), Validators.max(5000)]],
    altitude_local: [1000, [Validators.required, Validators.min(-500), Validators.max(9000)]],
    manual_irrigation_max_s: [600, [Validators.required, Validators.min(1), Validators.max(3600)]],
    pump_sample_interval_s: [10, [Validators.required, Validators.min(1), Validators.max(120)]],
    deep_sleep_enabled: [true],
    capture_interval_seconds: [30, [Validators.required, Validators.min(5), Validators.max(3600)]],
    deep_sleep_seconds: [60, [Validators.required, Validators.min(10), Validators.max(3600)]],
    http_timeout_ms: [10000, [Validators.required, Validators.min(1000), Validators.max(120000)]],
    http_max_retries: [3, [Validators.required, Validators.min(0), Validators.max(10)]],
    wifi_timeout_ms: [20000, [Validators.required, Validators.min(1000), Validators.max(120000)]],
    cold_boot_usb_wait_ms: [2000, [Validators.required, Validators.min(0), Validators.max(30000)]],
    ntp_server_primary: ['pool.ntp.org', [Validators.required, Validators.minLength(1)]],
    ntp_server_secondary: ['time.google.com', [Validators.required, Validators.minLength(1)]],
    ntp_sync_wait_ms: [3500, [Validators.required, Validators.min(500), Validators.max(30000)]],
    ntp_min_valid_year: [2024, [Validators.required, Validators.min(2020), Validators.max(2100)]],
    ntp_gmt_offset_sec: [-10800, [Validators.required, Validators.min(-43200), Validators.max(43200)]],
    ntp_daylight_offset_sec: [0, [Validators.required, Validators.min(0), Validators.max(7200)]],
    pending_batch_max_items: [20, [Validators.required, Validators.min(1), Validators.max(50)]],
    pending_batch_max_bytes: [16384, [Validators.required, Validators.min(1024), Validators.max(65536)]],
    pending_max_bytes: [262144, [Validators.required, Validators.min(8192), Validators.max(1048576)]],
    pending_max_lines: [800, [Validators.required, Validators.min(10), Validators.max(5000)]],
    panel_voltage_noise_floor_v: [1.0, [Validators.required, Validators.min(0), Validators.max(6)]],
    sensor_average_rounds: [3, [Validators.required, Validators.min(1), Validators.max(10)]],
    adc_samples: [16, [Validators.required, Validators.min(4), Validators.max(64)]],
    ina_average_rounds: [5, [Validators.required, Validators.min(1), Validators.max(20)]],
    ina_sample_delay_ms: [50, [Validators.required, Validators.min(10), Validators.max(500)]],
    pump_delay_chunk_ms: [500, [Validators.required, Validators.min(100), Validators.max(2000)]],
    http_retry_delay_ms: [2000, [Validators.required, Validators.min(500), Validators.max(30000)]],
    relay_active_high: [true],
  });

  ngOnInit(): void {
    this.seo.update({
      title: 'Dispositivo — Configurações',
      description:
        'Calibração de solo, temporização, NTP e fila offline do firmware ESP32.',
      robots: 'noindex, nofollow',
    });
    this.loadConfig();
  }

  protected loadConfig(): void {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    this.api.getDeviceConfig().subscribe({
      next: (cfg) => {
        this.patchForm(cfg);
        this.lastUpdated.set(cfg.updated_at ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Não foi possível carregar as configurações.');
        this.loading.set(false);
      },
    });
  }

  protected setDeepSleepEnabled(enabled: boolean): void {
    this.form.controls.deep_sleep_enabled.setValue(enabled);
    this.error.set(null);
    this.success.set(null);
  }

  protected setRelayActiveHigh(activeHigh: boolean): void {
    this.form.controls.relay_active_high.setValue(activeHigh);
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

    const payload = this.form.getRawValue() as DeviceConfigInput;

    this.api.putDeviceConfig(payload).subscribe({
      next: (saved) => {
        this.patchForm(saved);
        this.lastUpdated.set(saved.updated_at ?? null);
        this.saving.set(false);
        this.success.set('Configurações salvas. O dispositivo aplicará na próxima sincronização.');
      },
      error: () => {
        this.saving.set(false);
        this.error.set('Falha ao salvar as configurações.');
      },
    });
  }

  private patchForm(cfg: DeviceConfig): void {
    const { updated_at: _updatedAt, ...values } = cfg;
    this.form.patchValue(values);
  }
}
