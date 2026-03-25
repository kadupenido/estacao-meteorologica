export const environment = {
  production: false,
  apiUrl: 'https://tempo.kadupenido.com/api',
  siteUrl: 'http://localhost:4200',
  /** Intervalo (ms) entre atualizações: medição atual, previsão e gráfico do dia. Padrão: 5 min. */
  refreshIntervalMs: 5 * 60 * 1000,
  /** Alinhar com api/app/config.py (rain_power_a / rain_power_b) */
  rainPowerA: 5.0,
  rainPowerB: 1.5,
};
