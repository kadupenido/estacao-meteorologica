export const environment = {
  production: true,
  apiUrl: '/api',
  siteUrl: 'https://tempo.kadupenido.com',
  /** Intervalo (ms) entre atualizações: medição atual e gráfico do dia. Padrão: 5 min. */
  refreshIntervalMs: 5 * 60 * 1000,
  /** Localização exibida no subtítulo do dashboard. */
  location: 'Belo Horizonte, MG',
  /** Tensões para alerta visual de bateria (V). Sistema Li-ion 1S. */
  batteryWarnVoltage: 3.5,
  batteryDangerVoltage: 3.2,
  /** Tensões para status do painel solar (V). Painel 6V. */
  panelOkVoltage: 5,
  panelWarnVoltage: 1,
};
