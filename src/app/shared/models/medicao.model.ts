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
  created_at: string;
}
