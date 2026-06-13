import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, finalize, shareReplay, tap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AUTH_REFRESH_TOKEN_STORAGE_KEY,
  AUTH_TOKEN_STORAGE_KEY,
} from '../auth/auth.constants';

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthUser {
  id: number;
  username: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  /** Sincronizado com localStorage quando em browser. */
  private readonly tokenSignal = signal<string | null>(null);
  readonly token = this.tokenSignal.asReadonly();

  private refreshInFlight: Observable<LoginResponse> | null = null;

  syncFromStorage(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.tokenSignal.set(null);
      return;
    }
    this.tokenSignal.set(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY));
  }

  isLoggedIn(): boolean {
    return this.tokenSignal() !== null;
  }

  getRefreshToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    return localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY);
  }

  private persistTokens(res: LoginResponse): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, res.access_token);
      localStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, res.refresh_token);
    }
    this.tokenSignal.set(res.access_token);
  }

  private clearTokens(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      localStorage.removeItem(AUTH_REFRESH_TOKEN_STORAGE_KEY);
    }
    this.tokenSignal.set(null);
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { username, password })
      .pipe(tap((res) => this.persistTokens(res)));
  }

  refreshSession(): Observable<LoginResponse> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('Refresh token ausente'));
    }
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    this.refreshInFlight = this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/refresh`, { refresh_token: refreshToken })
      .pipe(
        tap((res) => this.persistTokens(res)),
        finalize(() => {
          this.refreshInFlight = null;
        }),
        shareReplay(1),
      );
    return this.refreshInFlight;
  }

  logout(): void {
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      this.http
        .post(`${environment.apiUrl}/auth/logout`, { refresh_token: refreshToken })
        .subscribe({ error: () => undefined });
    }
    this.clearTokens();
  }

  me(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${environment.apiUrl}/auth/me`);
  }
}
