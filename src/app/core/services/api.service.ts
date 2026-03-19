import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Medicao } from '../../shared/models/medicao.model';
import type { Previsao } from '../../shared/models/previsao.model';

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

  getPrevisao(): Observable<Previsao | null> {
    return this.http.get<Previsao>(`${this.baseUrl}/previsao`).pipe(
      catchError((err) => {
        if (err?.status === 503) return of(null);
        return throwError(() => err);
      }),
    );
  }
}
