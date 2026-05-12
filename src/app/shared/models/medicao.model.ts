export interface Medicao {
  id: number;
  temperatura: number | null;
  umidade: number | null;
  pressao: number | null;
  temperatura_bme: number | null;
  umidade_bme: number | null;
  temperatura_sht: number | null;
  umidade_sht: number | null;
  tensao_bateria: number | null;
  tensao_painel: number | null;
  umidade_solo_1: number | null;
  umidade_solo_2: number | null;
  tempo_irrigacao_s_1: number | null;
  tempo_irrigacao_s_2: number | null;
  created_at: string;
}
