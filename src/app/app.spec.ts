import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { AuthService } from './core/services/auth.service';

function createAuthMock(initialToken: string | null = null) {
  const token = signal(initialToken);
  return {
    syncFromStorage: () => {},
    token: token.asReadonly(),
    logout: () => token.set(null),
  };
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AuthService, useValue: createAuthMock() }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the primary header navigation', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('header.app-header')).toBeTruthy();
    expect(compiled.querySelector('nav[aria-label="Navegação principal"]')).toBeTruthy();
  });

  it('should render footer credit without navigation links', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const footer = compiled.querySelector('footer');

    expect(footer?.querySelector('p')?.textContent).toContain('Monitor Ambiental');
    expect(footer?.querySelectorAll('a').length).toBe(0);
  });
});

describe('App header auth visibility', () => {
  it('shows Entrar for guests and hides irrigation', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AuthService, useValue: createAuthMock() }],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const nav = fixture.nativeElement.querySelector(
      'nav[aria-label="Navegação principal"]',
    ) as HTMLElement;

    expect(nav.textContent).toContain('Entrar');
    expect(nav.textContent).not.toContain('Irrigação');
    expect(nav.textContent).not.toContain('Conta');
  });

  it('shows Conta and irrigation when authenticated', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createAuthMock('test-token') },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const nav = fixture.nativeElement.querySelector(
      'nav[aria-label="Navegação principal"]',
    ) as HTMLElement;

    expect(nav.textContent).toContain('Conta');
    expect(nav.textContent).toContain('Irrigação');
    expect(nav.textContent).not.toContain('Entrar');
  });
});
