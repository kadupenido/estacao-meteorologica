import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import {
  AUTH_REFRESH_TOKEN_STORAGE_KEY,
  AUTH_TOKEN_STORAGE_KEY,
} from '../auth/auth.constants';
import { AuthService } from '../services/auth.service';

const RETRY_HEADER = 'X-Retry-After-Refresh';

function isAuthExemptRequest(method: string, url: string): boolean {
  if (method === 'POST' && url.includes('/auth/login')) return true;
  if (method === 'POST' && url.includes('/auth/refresh')) return true;
  if (method === 'POST' && url.includes('/auth/logout')) return true;
  return false;
}

function withBearer(req: Parameters<HttpInterceptorFn>[0], token: string) {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (isAuthExemptRequest(req.method, req.url)) {
    return next(req);
  }

  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) {
    return next(req);
  }

  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  const authedReq = token ? withBearer(req, token) : req;

  return next(authedReq).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err);
      }
      if (isAuthExemptRequest(req.method, req.url)) {
        return throwError(() => err);
      }

      const auth = inject(AuthService);
      const router = inject(Router);

      if (req.headers.has(RETRY_HEADER)) {
        auth.syncFromStorage();
        auth.logout();
        return throwError(() => err);
      }
      if (!localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)) {
        auth.syncFromStorage();
        auth.logout();
        return throwError(() => err);
      }

      return auth.refreshSession().pipe(
        switchMap((res) => {
          const retryReq = withBearer(req, res.access_token).clone({
            setHeaders: { [RETRY_HEADER]: '1' },
          });
          return next(retryReq);
        }),
        catchError((refreshErr) => {
          auth.logout();
          void router.navigate(['/login'], {
            queryParams: { returnUrl: router.url },
          });
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
