import { Component, OnInit, inject, signal, afterNextRender } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

import { SeoService } from '../../core/services/seo.service';
import { AuthService, type AuthUser } from '../../core/services/auth.service';

@Component({
  selector: 'app-conta',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './conta.component.html',
  styleUrl: './conta.component.scss',
})
export class ContaComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);

  protected readonly user = signal<AuthUser | null>(null);
  protected readonly loadError = signal<string | null>(null);

  constructor() {
    afterNextRender(() => {
      this.auth.me().subscribe({
        next: (u) => {
          this.user.set(u);
          this.loadError.set(null);
        },
        error: (err: unknown) => {
          this.user.set(null);
          if (err instanceof HttpErrorResponse && err.status === 401) {
            this.loadError.set('Sessão expirada ou inválida.');
          } else {
            this.loadError.set('Não foi possível carregar o perfil.');
          }
        },
      });
    });
  }

  ngOnInit(): void {
    this.seo.update({
      title: 'A minha conta — Monitor Ambiental',
      description: 'Sessão autenticada no Monitor Ambiental.',
      robots: 'noindex, nofollow',
    });
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
