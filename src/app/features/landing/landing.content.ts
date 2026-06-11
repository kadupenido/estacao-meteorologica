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

export interface LandingPortal {
  title: string;
  description: string;
  route: string;
  ctaLabel: string;
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
  { label: `Leituras a cada ~${refreshMinutes} min` },
  { label: 'Clima e energia públicos, sem login' },
];

export const LANDING_PORTALS: LandingPortal[] = [
  {
    title: 'Clima',
    description:
      'Temperatura, umidade e pressão em tempo real, com gráficos e mínimos/máximos do dia.',
    route: '/clima',
    ctaLabel: 'Abrir clima',
  },
  {
    title: 'Energia',
    description:
      'Painel solar e consumo do sistema, com energia estimada (Wh), saldo e cobertura solar.',
    route: '/energia',
    ctaLabel: 'Abrir energia',
  },
  {
    title: 'Irrigação',
    description:
      'Monitoramento das zonas de solo, comandos manuais e configuração de limiares após login.',
    route: '/login',
    ctaLabel: 'Entrar para irrigar',
  },
];

export const LANDING_METRICS: LandingMetric[] = [
  {
    title: 'Temperatura e umidade',
    detail: 'Leitura exclusiva via SHT31, com série única no histórico de clima.',
  },
  {
    title: 'Pressão atmosférica',
    detail: 'Pressão em hPa via BME280, ajustada à altitude local da estação.',
  },
  {
    title: 'Energia solar e sistema',
    detail:
      'INA219 alimenta a página Energia com potência, Wh estimados e comparação painel vs consumo.',
  },
  {
    title: 'Umidade do solo',
    detail: 'Duas zonas com leitura periódica e irrigação automática por limiar.',
  },
];

export const LANDING_FEATURES: LandingFeature[] = [
  {
    title: 'Clima em tempo real',
    description:
      'Última medição de temperatura, umidade e pressão com atualização periódica na página Clima.',
    icon: 'live',
  },
  {
    title: 'Histórico do dia',
    description:
      'Gráficos por variável climática, mínimos e máximos e escolha da data para comparar.',
    icon: 'charts',
  },
  {
    title: 'Análise energética',
    description:
      'Página Energia com Wh estimados, picos de potência, saldo painel − sistema e gráficos dedicados.',
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
      'O ESP32-S3 lê SHT31, BME280, INA219 e solo, acumula leituras e envia lotes para a API.',
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
      'As páginas Clima e Energia são públicas; a irrigação fica na área autenticada.',
  },
];

export const LANDING_PROJECT_COPY = {
  title: 'O projeto',
  lead:
    'Monitor Ambiental reúne hardware no campo, API central e interface web para acompanhar clima, energia e solo sem depender de planilhas.',
  body:
    'Fila offline no dispositivo ajuda a manter o histórico mesmo quando a rede oscila.',
};

export const LANDING_HERO_COPY = {
  title: 'Monitor Ambiental',
  lead: `Estação em ${environment.location} com páginas dedicadas de clima e energia, irrigação por umidade do solo e histórico diário — tudo acessível pelo navegador.`,
};

export const LANDING_CTA_COPY = {
  title: 'Veja os dados agora',
  lead: 'Abra o clima para condições atuais ou a energia para diagnóstico do painel solar e do consumo.',
};
