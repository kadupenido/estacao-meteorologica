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

export interface IrrigationZoneSummary {
  active: boolean;
  current_soil_humidity: number | null;
  current_soil_humidity_at: string | null;
  last_irrigation_at: string | null;
  last_irrigation_duration_s: number | null;
}

export interface IrrigationSummaryResponse {
  zone_1: IrrigationZoneSummary;
  zone_2: IrrigationZoneSummary;
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
}
