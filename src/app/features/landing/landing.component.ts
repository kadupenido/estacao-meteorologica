import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SeoService } from '../../core/services/seo.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent implements OnInit {
  private readonly seo = inject(SeoService);
  protected readonly auth = inject(AuthService);

  ngOnInit(): void {
    this.auth.syncFromStorage();
    this.seo.update({
      title: 'Monitor Ambiental — Monitoramento em tempo real',
      description:
        'Acompanhe temperatura, umidade, pressão atmosférica e energia da estação meteorológica. Acesso público ao dashboard e área reservada para sessão autenticada.',
      keywords:
        'monitor ambiental, estação meteorológica, temperatura, umidade, painel solar, bateria',
    });
  }
}
