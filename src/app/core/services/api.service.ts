import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Medicao } from '../../shared/models/medicao.model';

export interface IrrigationZoneConfig {
  zone: 1 | 2;
  threshold_pct: number;
  pump_duration_s: number;
  hysteresis_pct: number;
  active: boolean;
}

export interface IrrigationConfigResponse {
  zone_1: IrrigationZoneConfig;
  zone_2: IrrigationZoneConfig;
}

export interface IrrigationManualPending {
  id: number;
  duration_s: number;
  created_at: string;
  expires_at: string;
}

export interface IrrigationManualRunning {
  id: number;
  duration_s: number;
  started_at: string;
}

export interface IrrigationManualExecuted {
  id: number;
  executed_at: string;
  executed_duration_s: number;
}

export interface IrrigationZoneManual {
  pending: IrrigationManualPending | null;
  running: IrrigationManualRunning | null;
  last_executed: IrrigationManualExecuted | null;
}

export interface IrrigationManualCommand {
  id: number;
  zone: 1 | 2;
  duration_s: number;
  status: 'pending' | 'running' | 'executed' | 'canceled' | 'expired';
  created_at: string;
  expires_at: string;
  started_at: string | null;
  executed_at: string | null;
  executed_duration_s: number | null;
}

export interface IrrigationZoneSummary {
  active: boolean;
  current_soil_humidity: number | null;
  current_soil_humidity_at: string | null;
  last_irrigation_at: string | null;
  last_irrigation_duration_s: number | null;
  manual: IrrigationZoneManual;
}

export interface IrrigationSummaryResponse {
  zone_1: IrrigationZoneSummary;
  zone_2: IrrigationZoneSummary;
}

export interface DeviceConfig {
  soil1_dry_mv: number;
  soil1_wet_mv: number;
  soil2_dry_mv: number;
  soil2_wet_mv: number;
  altitude_local: number;
  manual_irrigation_max_s: number;
  pump_sample_interval_s: number;
  deep_sleep_enabled: boolean;
  capture_interval_seconds: number;
  deep_sleep_seconds: number;
  http_timeout_ms: number;
  http_max_retries: number;
  wifi_timeout_ms: number;
  cold_boot_usb_wait_ms: number;
  ntp_server_primary: string;
  ntp_server_secondary: string;
  ntp_sync_wait_ms: number;
  ntp_min_valid_year: number;
  ntp_gmt_offset_sec: number;
  ntp_daylight_offset_sec: number;
  pending_batch_max_items: number;
  pending_batch_max_bytes: number;
  pending_max_bytes: number;
  pending_max_lines: number;
  panel_voltage_noise_floor_v: number;
  sensor_average_rounds: number;
  adc_samples: number;
  ina_average_rounds: number;
  ina_sample_delay_ms: number;
  pump_delay_chunk_ms: number;
  http_retry_delay_ms: number;
  relay_active_high: boolean;
  updated_at?: string | null;
}

export type DeviceConfigInput = Omit<DeviceConfig, 'updated_at'>;

export interface DeviceLog {
  id: number;
  source: string;
  message: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  getUltimaMedicao(): Observable<Medicao | null> {
    return this.http.get<Medicao>(`${this.baseUrl}/dados/ultima`).pipe(
      catchError((err) => {
        if (err?.status === 404) return of(null);
        return throwError(() => err);
      }),
    );
  }

  getMedicoesPorData(data: string): Observable<Medicao[]> {
    return this.http.get<Medicao[]>(`${this.baseUrl}/dados/por-data`, { params: { data } });
  }

  getIrrigationConfig(): Observable<IrrigationConfigResponse> {
    return this.http.get<IrrigationConfigResponse>(`${this.baseUrl}/irrigation/config`);
  }

  putIrrigationConfig(payload: IrrigationConfigResponse): Observable<IrrigationConfigResponse> {
    return this.http.put<IrrigationConfigResponse>(`${this.baseUrl}/irrigation/config`, payload);
  }

  getIrrigationSummary(): Observable<IrrigationSummaryResponse> {
    return this.http.get<IrrigationSummaryResponse>(`${this.baseUrl}/irrigation/resumo`);
  }

  postIrrigationManual(payload: { zone: 1 | 2; duration_s: number }): Observable<IrrigationManualCommand> {
    return this.http.post<IrrigationManualCommand>(`${this.baseUrl}/irrigation/manual`, payload);
  }

  cancelIrrigationManual(id: number): Observable<IrrigationManualCommand> {
    return this.http.delete<IrrigationManualCommand>(`${this.baseUrl}/irrigation/manual/${id}`);
  }

  getDeviceConfig(): Observable<DeviceConfig> {
    return this.http.get<DeviceConfig>(`${this.baseUrl}/device/config`);
  }

  putDeviceConfig(payload: DeviceConfigInput): Observable<DeviceConfig> {
    return this.http.put<DeviceConfig>(`${this.baseUrl}/device/config`, payload);
  }

  getDeviceLogsPorData(data: string): Observable<DeviceLog[]> {
    return this.http.get<DeviceLog[]>(`${this.baseUrl}/device/logs/por-data`, { params: { data } });
  }

  getDeviceLogsRecent(limit = 200): Observable<DeviceLog[]> {
    return this.http.get<DeviceLog[]>(`${this.baseUrl}/device/logs/recent`, {
      params: { limit: String(limit) },
    });
  }
}
