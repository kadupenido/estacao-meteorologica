import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

import { environment } from '../../../environments/environment';
import type { Medicao } from '../../shared/models/medicao.model';

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

@Injectable({ providedIn: 'root' })
export class JsonLdService {
  private readonly doc = inject(DOCUMENT);
  private scriptElement: HTMLScriptElement | null = null;

  setWebApplication(): void {
    this.setSchema({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Monitor Ambiental',
      url: environment.siteUrl,
      description:
        'Monitoramento em tempo real de temperatura, umidade, pressão atmosférica e energia do painel/sistema.',
      applicationCategory: 'UtilityApplication',
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
    const measuredProperty: object[] = [];

    if (isNum(medicao.temperatura)) {
      measuredProperty.push({
        '@type': 'PropertyValue',
        name: 'Temperatura',
        value: medicao.temperatura,
        unitText: '°C',
        unitCode: 'CEL',
      });
    }
    if (isNum(medicao.umidade)) {
      measuredProperty.push({
        '@type': 'PropertyValue',
        name: 'Umidade relativa',
        value: medicao.umidade,
        unitText: '%',
        unitCode: 'P1',
      });
    }
    if (isNum(medicao.pressao)) {
      measuredProperty.push({
        '@type': 'PropertyValue',
        name: 'Pressão atmosférica',
        value: medicao.pressao,
        unitText: 'hPa',
        unitCode: 'A97',
      });
    }
    if (isNum(medicao.tensao_sistema)) {
      measuredProperty.push({
        '@type': 'PropertyValue',
        name: 'Tensão do sistema',
        value: medicao.tensao_sistema,
        unitText: 'V',
        unitCode: 'VLT',
      });
    }
    if (isNum(medicao.tensao_painel)) {
      measuredProperty.push({
        '@type': 'PropertyValue',
        name: 'Tensão do painel solar',
        value: medicao.tensao_painel,
        unitText: 'V',
        unitCode: 'VLT',
      });
    }
    if (isNum(medicao.corrente_painel)) {
      measuredProperty.push({
        '@type': 'PropertyValue',
        name: 'Corrente do painel solar',
        value: medicao.corrente_painel,
        unitText: 'mA',
      });
    }
    if (isNum(medicao.corrente_sistema)) {
      measuredProperty.push({
        '@type': 'PropertyValue',
        name: 'Corrente do sistema',
        value: medicao.corrente_sistema,
        unitText: 'mA',
      });
    }

    this.setSchema({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebApplication',
          name: 'Monitor Ambiental',
          url: environment.siteUrl,
          description:
            'Monitoramento em tempo real de temperatura, umidade, pressão atmosférica e energia do painel/sistema.',
          applicationCategory: 'UtilityApplication',
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
          name: 'Medição ambiental atual',
          observationDate: medicao.created_at,
          measuredProperty,
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
