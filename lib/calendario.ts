/**
 * Dias habiles. Modulo puro: lo usan el servidor y el cliente.
 *
 * Regla por defecto: se trabaja de lunes a viernes. Las excepciones (feriados,
 * un sabado que se trabaja, vacaciones) vienen de la tabla `calendario` y
 * mandan sobre la regla.
 */

export type Excepcion = { laborable: boolean; nombre: string | null };
export type Calendario = Record<string, Excepcion>;

/** 0 = domingo ... 6 = sabado. Al mediodia UTC para no depender de la zona. */
export const diaDeSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();

export const esFinDeSemana = (dia: string) => {
  const d = diaDeSemana(dia);
  return d === 0 || d === 6;
};

export function esHabil(dia: string, cal: Calendario): boolean {
  const e = cal[dia];
  return e ? e.laborable : !esFinDeSemana(dia);
}

/**
 * Por que un dia no es habil, o por que se trabaja aunque no le toque. Null si
 * es un dia comun de lunes a viernes.
 */
export function motivoDia(dia: string, cal: Calendario): string | null {
  const e = cal[dia];
  const finde = esFinDeSemana(dia) ? (diaDeSemana(dia) === 0 ? "domingo" : "sábado") : null;
  if (e && !e.laborable) return e.nombre ? `No se trabaja · ${e.nombre}` : "No se trabaja";
  if (e?.laborable) {
    if (e.nombre) return `Se trabaja · ${e.nombre}`;
    return finde ? `Se trabaja (${finde})` : null;
  }
  return finde ? `${finde === "domingo" ? "Domingo" : "Sábado"}: no se trabaja` : null;
}
