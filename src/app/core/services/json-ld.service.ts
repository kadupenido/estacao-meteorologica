import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

import { environment } from '../../../environments/environment';
import type { Medicao } from '../../shared/models/medicao.model';

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function avg(...vals: Array<number | null | undefined>): number | null {
  const nums = vals.filter(isNum);
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
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
        'Monitoramento em tempo real de temperatura, umidade, pressão atmosférica, tensão da bateria e do painel solar.',
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
    const tempAvg =
      avg(medicao.temperatura_bme, medicao.temperatura_sht) ?? medicao.temperatura ?? null;
    const umidAvg = avg(medicao.umidade_bme, medicao.umidade_sht) ?? medicao.umidade ?? null;

    const measuredProperty: object[] = [];

    if (isNum(tempAvg)) {
      measuredProperty.push({
        '@type': 'PropertyValue',
        name: 'Temperatura',
        value: tempAvg,
        unitText: '°C',
        unitCode: 'CEL',
      });
    }
    if (isNum(umidAvg)) {
      measuredProperty.push({
        '@type': 'PropertyValue',
        name: 'Umidade relativa',
        value: umidAvg,
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
    if (isNum(medicao.tensao_bateria)) {
      measuredProperty.push({
        '@type': 'PropertyValue',
        name: 'Tensão da bateria',
        value: medicao.tensao_bateria,
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

    this.setSchema({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebApplication',
          name: 'Monitor Ambiental',
          url: environment.siteUrl,
          description:
            'Monitoramento em tempo real de temperatura, umidade, pressão atmosférica, tensão da bateria e do painel solar.',
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
