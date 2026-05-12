import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { AUTH_TOKEN_STORAGE_KEY } from '../auth/auth.constants';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const isLogin = req.method === 'POST' && req.url.includes('/auth/login');
  if (isLogin) {
    return next(req);
  }
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) {
    return next(req);
  }
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (!token) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
