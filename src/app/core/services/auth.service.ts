import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AUTH_TOKEN_STORAGE_KEY } from '../auth/auth.constants';

export interface LoginResponse {
  access_token: string;
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

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { username, password })
      .pipe(
        tap((res) => {
          if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, res.access_token);
          }
          this.tokenSignal.set(res.access_token);
        }),
      );
  }

  logout(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
    this.tokenSignal.set(null);
  }

  me(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${environment.apiUrl}/auth/me`);
  }
}
