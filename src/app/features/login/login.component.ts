import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

import { SeoService } from '../../core/services/seo.service';
import { AuthService } from '../../core/services/auth.service';

function safeReturnUrl(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) {
    return fallback;
  }
  return raw;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);

  protected readonly submitting = signal(false);
  protected readonly errorMsg = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(1)]],
    password: ['', [Validators.required]],
  });

  ngOnInit(): void {
    this.auth.syncFromStorage();
    if (this.auth.isLoggedIn()) {
      void this.router.navigateByUrl('/dashboard');
      return;
    }
    this.seo.update({
      title: 'Entrar — Monitor Ambiental',
      description: 'Inicie sessão para aceder à área reservada.',
      robots: 'noindex, nofollow',
    });
  }

  protected submit(): void {
    this.errorMsg.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { username, password } = this.form.getRawValue();
    this.submitting.set(true);
    this.auth.login(username.trim(), password).subscribe({
      next: () => {
        this.submitting.set(false);
        const returnUrl = safeReturnUrl(
          this.route.snapshot.queryParamMap.get('returnUrl'),
          '/dashboard',
        );
        void this.router.navigateByUrl(returnUrl);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        let msg = 'Não foi possível iniciar sessão. Tente novamente.';
        if (err instanceof HttpErrorResponse && err.error?.detail) {
          msg = String(err.error.detail);
        }
        this.errorMsg.set(msg);
      },
    });
  }
}
