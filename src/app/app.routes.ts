import { Routes } from '@angular/router';

import { LandingComponent } from './features/landing/landing.component';
import { LoginComponent } from './features/login/login.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { ContaComponent } from './features/conta/conta.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'conta', canActivate: [authGuard], component: ContaComponent },
  { path: '**', redirectTo: '' },
];
