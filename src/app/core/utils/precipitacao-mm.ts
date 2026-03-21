/**
 * Paridade com api/app/ml/preprocessing.py (corrigir_adc_esp32 + adc_para_mm).
 * O valor armazenado/enviado é o ADC invertido do ESP32 (maior = mais molhado).
 */

export function corrigirAdcEsp32(raw: number): number {
  const clamped = Math.max(0, Math.min(4095, Number(raw)));
  const vRaw = (clamped / 4095.0) * 3.3;
  const vCorr = -0.00000061 * vRaw ** 3 + 0.000834 * vRaw ** 2 + 0.9458 * vRaw;
  return (vCorr / 3.3) * 4095;
}

export function adcParaMm(valorAdc: number, a: number, b: number): number {
  const valorCorrigido = corrigirAdcEsp32(valorAdc);
  if (valorCorrigido >= 4095) {
    return 0.0;
  }
  const valorNorm = valorCorrigido / 4095;
  return a * valorNorm ** b;
}
