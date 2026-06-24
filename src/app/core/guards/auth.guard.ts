import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) {
    return true;
  }
  const auth = inject(AuthService);
  const router = inject(Router);
  auth.syncFromStorage();

  const loginRedirect = router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });

  return auth.ensureSession().pipe(
    map((ok) => ok || loginRedirect),
    catchError(() => of(loginRedirect)),
  );
};
