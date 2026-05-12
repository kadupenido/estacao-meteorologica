import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';

type NavVisibility = 'always' | 'auth';

interface NavItem {
  label: string;
  route: string;
  visibleWhen: NavVisibility;
  exact?: boolean;
}

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.scss',
})
export class AppHeaderComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly mobileMenuOpen = signal(false);
  protected readonly isLoggedIn = computed(() => this.auth.token() !== null);

  protected readonly primaryNav: NavItem[] = [
    { label: 'Início', route: '/', visibleWhen: 'always', exact: true },
    { label: 'Dashboard', route: '/dashboard', visibleWhen: 'always' },
    { label: 'Irrigação', route: '/irrigation', visibleWhen: 'auth', exact: false },
  ];

  protected readonly visiblePrimaryNav = computed(() =>
    this.primaryNav.filter(
      (item) => item.visibleWhen === 'always' || (item.visibleWhen === 'auth' && this.isLoggedIn()),
    ),
  );

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.mobileMenuOpen.set(false);
      });
  }

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.mobileMenuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.mobileMenuOpen()) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && this.host.nativeElement.contains(target)) {
      return;
    }
    this.mobileMenuOpen.set(false);
  }
}
