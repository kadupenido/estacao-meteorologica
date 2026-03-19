export interface PrevisaoHorizonte {
  horizonte: string;
  probabilidade: number;
  previsao: string;
  threshold: number;
}

export interface Previsao {
  referencia: string;
  previsoes: PrevisaoHorizonte[];
}
