export interface Medicao {
  id: number | null;
  temperatura: number | null;
  umidade: number | null;
  pressao: number | null;
  tensao_painel: number | null;
  corrente_painel: number | null;
  potencia_painel: number | null;
  tensao_sistema: number | null;
  corrente_sistema: number | null;
  potencia_sistema: number | null;
  umidade_solo_1: number | null;
  umidade_solo_2: number | null;
  adc_solo_1: number | null;
  adc_solo_2: number | null;
  mv_solo_1: number | null;
  mv_solo_2: number | null;
  tempo_irrigacao_s_1: number | null;
  tempo_irrigacao_s_2: number | null;
  created_at: string;
}
