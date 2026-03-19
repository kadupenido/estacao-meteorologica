import { Routes } from '@angular/router';

import { DashboardComponent } from './features/dashboard/dashboard.component';
import { EvolucaoComponent } from './features/evolucao/evolucao.component';

export const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'evolucao', component: EvolucaoComponent },
];
