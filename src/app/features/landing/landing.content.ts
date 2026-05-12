import { environment } from '../../../environments/environment';

export interface LandingImage {
  webpSrc: string;
  jpegSrc: string;
  width: number;
  height: number;
  alt: string;
  credit: string;
  creditUrl: string;
  license: string;
  licenseUrl: string;
}

export interface LandingTrustItem {
  label: string;
}

export interface LandingMetric {
  title: string;
  detail: string;
}

export type LandingFeatureIcon =
  | 'live'
  | 'charts'
  | 'energy'
  | 'irrigation'
  | 'account';

export interface LandingFeature {
  title: string;
  description: string;
  icon: LandingFeatureIcon;
}

export interface LandingFlowStep {
  step: number;
  title: string;
  description: string;
}

const refreshMinutes = Math.round(environment.refreshIntervalMs / 60_000);

export const LANDING_HERO_IMAGE: LandingImage = {
  webpSrc: '/images/landing/hero.webp',
  jpegSrc: '/images/landing/hero.jpg',
  width: 1400,
  height: 933,
  alt: 'Céu com nuvens densas, ilustrando monitoramento climático ao ar livre.',
  credit: 'Johannes Plenio',
  creditUrl: 'https://unsplash.com/@jplenio',
  license: 'Unsplash License',
  licenseUrl: 'https://unsplash.com/license',
};

export const LANDING_PROJECT_IMAGE: LandingImage = {
  webpSrc: '/images/landing/project.webp',
  jpegSrc: '/images/landing/project.jpg',
  width: 1200,
  height: 800,
  alt: 'Mãos cuidando de plantas em solo úmido, representando irrigação e umidade do solo.',
  credit: 'Markus Spiske',
  creditUrl: 'https://unsplash.com/@markusspiske',
  license: 'Unsplash License',
  licenseUrl: 'https://unsplash.com/license',
};

export const LANDING_IMAGE_CREDITS: LandingImage[] = [
  LANDING_HERO_IMAGE,
  LANDING_PROJECT_IMAGE,
];

export const LANDING_TRUST_ITEMS: LandingTrustItem[] = [
  { label: environment.location },
  { label: `Leituras no dashboard a cada ~${refreshMinutes} min` },
  { label: 'Dashboard público, sem login' },
];

export const LANDING_METRICS: LandingMetric[] = [
  {
    title: 'Temperatura e umidade',
    detail: 'BME280 e SHT31 em paralelo, com médias e séries separadas no histórico.',
  },
  {
    title: 'Pressão atmosférica',
    detail: 'Pressão em hPa ajustada à altitude local da estação.',
  },
  {
    title: 'Bateria e painel solar',
    detail: 'Tensões da bateria Li-ion 1S e do painel de 6 V para acompanhar a energia.',
  },
  {
    title: 'Umidade do solo',
    detail: 'Duas zonas com leitura periódica e irrigação automática por limiar.',
  },
];

export const LANDING_FEATURES: LandingFeature[] = [
  {
    title: 'Tempo real',
    description:
      'Última medição com atualização periódica dos sensores climáticos e status de energia.',
    icon: 'live',
  },
  {
    title: 'Evolução do dia',
    description:
      'Gráficos por variável, mínimos e máximos e escolha da data para comparar o histórico.',
    icon: 'charts',
  },
  {
    title: 'Energia da estação',
    description:
      'Chips de bateria e painel solar com alertas visuais quando a tensão sai da faixa esperada.',
    icon: 'energy',
  },
  {
    title: 'Irrigação autenticada',
    description:
      'Monitoramento das zonas de solo, últimas ativações das bombas e ajuste de limiar, histerese e tempo de acionamento após login.',
    icon: 'irrigation',
  },
];

export const LANDING_FLOW_STEPS: LandingFlowStep[] = [
  {
    step: 1,
    title: 'Coleta no campo',
    description:
      'O ESP32-S3 lê sensores climáticos, tensões e solo, acumula leituras e envia lotes para a API.',
  },
  {
    step: 2,
    title: 'Armazenamento na API',
    description:
      'A API central persiste medições e configurações de irrigação em PostgreSQL.',
  },
  {
    step: 3,
    title: 'Visualização na web',
    description:
      'O dashboard público mostra o agora e o histórico; a área autenticada cuida da irrigação.',
  },
];

export const LANDING_PROJECT_COPY = {
  title: 'O projeto',
  lead:
    'Monitor Ambiental reúne hardware no campo, API central e interface web para acompanhar clima, energia e solo sem depender de planilhas.',
  body:
    'Sensores redundantes e fila offline no dispositivo ajudam a manter o histórico mesmo quando a rede oscila.',
};

export const LANDING_HERO_COPY = {
  title: 'Monitor Ambiental',
  lead: `Estação em ${environment.location} com clima, energia (bateria e painel solar) e irrigação por umidade do solo — dashboard público e histórico do dia.`,
};

export const LANDING_CTA_COPY = {
  title: 'Veja os dados agora',
  lead: 'Abra o dashboard para a última leitura, gráficos do dia e status de energia da estação.',
};
