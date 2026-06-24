import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthService } from './core/services/auth.service';
import { isAccessTokenExpired } from './core/auth/jwt.utils';
import { AppHeaderComponent } from './shared/components/app-header/app-header.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppHeaderComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly auth = inject(AuthService);

  constructor() {
    this.auth.syncFromStorage();
    const token = this.auth.token();
    if (token && isAccessTokenExpired(token) && this.auth.hasRefreshToken()) {
      this.auth.ensureSession().subscribe({ error: () => undefined });
    }
  }
}
