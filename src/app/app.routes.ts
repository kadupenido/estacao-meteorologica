import { Routes } from '@angular/router';

import { LandingComponent } from './features/landing/landing.component';
import { LoginComponent } from './features/login/login.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { EnergiaComponent } from './features/energia/energia.component';
import { ContaComponent } from './features/conta/conta.component';
import { IrrigationMonitorComponent } from './features/irrigation/irrigation-monitor.component';
import { IrrigationSettingsComponent } from './features/irrigation/irrigation-settings.component';
import { DeviceSettingsComponent } from './features/device/device-settings.component';
import { DeviceLogsComponent } from './features/device/device-logs.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'login', component: LoginComponent },
  { path: 'clima', component: DashboardComponent },
  { path: 'dashboard', redirectTo: 'clima', pathMatch: 'full' },
  { path: 'energia', component: EnergiaComponent },
  { path: 'conta', canActivate: [authGuard], component: ContaComponent },
  { path: 'irrigation', canActivate: [authGuard], component: IrrigationMonitorComponent },
  { path: 'irrigation/settings', canActivate: [authGuard], component: IrrigationSettingsComponent },
  { path: 'device/settings', canActivate: [authGuard], component: DeviceSettingsComponent },
  { path: 'device/logs', canActivate: [authGuard], component: DeviceLogsComponent },
  { path: '**', redirectTo: '' },
];
