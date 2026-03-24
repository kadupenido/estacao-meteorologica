import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

import { environment } from '../../../environments/environment';
import type { Medicao } from '../../shared/models/medicao.model';

@Injectable({ providedIn: 'root' })
export class JsonLdService {
  private readonly doc = inject(DOCUMENT);
  private scriptElement: HTMLScriptElement | null = null;

  setWebApplication(): void {
    this.setSchema({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Estação Meteorológica',
      url: environment.siteUrl,
      description:
        'Monitoramento meteorológico em tempo real com dados de temperatura, umidade, pressão atmosférica e precipitação.',
      applicationCategory: 'WeatherApplication',
      operatingSystem: 'Web',
      inLanguage: 'pt-BR',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'BRL',
      },
    });
  }

  setWeatherObservation(medicao: Medicao): void {
    this.setSchema({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebApplication',
          name: 'Estação Meteorológica',
          url: environment.siteUrl,
          description:
            'Monitoramento meteorológico em tempo real com dados de temperatura, umidade, pressão atmosférica e precipitação.',
          applicationCategory: 'WeatherApplication',
          operatingSystem: 'Web',
          inLanguage: 'pt-BR',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'BRL',
          },
        },
        {
          '@type': 'Observation',
          name: 'Medição meteorológica atual',
          observationDate: medicao.created_at,
          measuredProperty: [
            {
              '@type': 'PropertyValue',
              name: 'Temperatura',
              value: medicao.temperatura,
              unitText: '°C',
              unitCode: 'CEL',
            },
            {
              '@type': 'PropertyValue',
              name: 'Umidade relativa',
              value: medicao.umidade,
              unitText: '%',
              unitCode: 'P1',
            },
            {
              '@type': 'PropertyValue',
              name: 'Pressão atmosférica',
              value: medicao.pressao,
              unitText: 'hPa',
              unitCode: 'A97',
            },
          ],
        },
      ],
    });
  }

  private setSchema(schema: object): void {
    if (!this.scriptElement) {
      this.scriptElement = this.doc.createElement('script');
      this.scriptElement.type = 'application/ld+json';
      this.doc.head.appendChild(this.scriptElement);
    }
    this.scriptElement.textContent = JSON.stringify(schema);
  }
}
