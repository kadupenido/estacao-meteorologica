export const environment = {
  production: true,
  apiUrl: '/api',
  siteUrl: 'https://tempo.kadupenido.com',
  /** Intervalo (ms) entre atualizações: medição atual e gráfico do dia. Padrão: 5 min. */
  refreshIntervalMs: 5 * 60 * 1000,
  /** Localização exibida no subtítulo do dashboard. */
  location: 'Belo Horizonte, MG',
  /** Tensões para alerta visual de bateria (V). */
  batteryWarnVoltage: 11.8,
  batteryDangerVoltage: 11.2,
};
