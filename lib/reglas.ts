/**
 * Reglas de planta para armar el programa. Modulo puro: lo usan servidor y
 * cliente. Ninguna bloquea: el programa avisa y deja seguir.
 */

/**
 * Diferencia minima entre llenado y desmolde de un mismo dia.
 *
 * Lo que se desmolda en el dia libera estanterias para el trompo, pero
 * mientras se desmolda la primera maquinada el trompo esta parado esperando.
 * Por eso no se puede desmoldar el 100 % de lo que se llena: con 11 llenados,
 * el desmolde de ese dia es como maximo 9.
 */
export const MARGEN_DESMOLDE = 2;

/** Tope de desmolde de un dia segun lo que se llena. Sin llenado no hay tope. */
export function topeDesmolde(llenado: number): number | null {
  return llenado > 0 ? Math.max(0, llenado - MARGEN_DESMOLDE) : null;
}
