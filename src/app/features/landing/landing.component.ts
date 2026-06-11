import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SeoService } from '../../core/services/seo.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import {
  LANDING_CTA_COPY,
  LANDING_FEATURES,
  LANDING_FLOW_STEPS,
  LANDING_HERO_COPY,
  LANDING_HERO_IMAGE,
  LANDING_IMAGE_CREDITS,
  LANDING_METRICS,
  LANDING_PORTALS,
  LANDING_PROJECT_COPY,
  LANDING_PROJECT_IMAGE,
  LANDING_TRUST_ITEMS,
} from './landing.content';

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

  protected readonly heroCopy = LANDING_HERO_COPY;
  protected readonly heroImage = LANDING_HERO_IMAGE;
  protected readonly trustItems = LANDING_TRUST_ITEMS;
  protected readonly projectCopy = LANDING_PROJECT_COPY;
  protected readonly projectImage = LANDING_PROJECT_IMAGE;
  protected readonly metrics = LANDING_METRICS;
  protected readonly portals = LANDING_PORTALS;
  protected readonly features = LANDING_FEATURES;
  protected readonly flowSteps = LANDING_FLOW_STEPS;
  protected readonly ctaCopy = LANDING_CTA_COPY;
  protected readonly imageCredits = LANDING_IMAGE_CREDITS;

  ngOnInit(): void {
    this.auth.syncFromStorage();
    this.seo.update({
      title: 'Monitor Ambiental — Monitoramento em tempo real',
      description:
        'Estação em Belo Horizonte com páginas públicas de clima e energia, gráficos diários e área autenticada para irrigação por umidade do solo.',
      keywords:
        'monitor ambiental, clima, energia solar, estação meteorológica, temperatura, umidade, pressão, painel solar, irrigação, umidade do solo',
      ogImage: `${environment.siteUrl}/images/landing/og-hero.webp`,
      twitterCard: 'summary_large_image',
    });
  }
}
