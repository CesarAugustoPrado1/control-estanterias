import { TZ } from "./tarjetas";

/**
 * Periodos de calendario para las pantallas que se consultan por fechas
 * (Produccion, Estadisticas). Modulo puro: sin base ni node.
 *
 * Un periodo son dos dias "AAAA-MM-DD" en hora de Argentina, los dos
 * incluidos. Es el formato de los <input type="date"> y de la URL, asi que
 * viaja tal cual: nada de Date con zona del servidor en el medio.
 */

export type Periodo = { desde: string; hasta: string };

export const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

export function hoy(): string {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** Suma dias a un "AAAA-MM-DD" sin pasar por la zona horaria del servidor. */
export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana de ese dia: en planta la semana arranca el lunes. */
export function lunes(dia: string): string {
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(dia, -((dow + 6) % 7));
}

const primeroDeMes = (dia: string) => `${dia.slice(0, 8)}01`;

/**
 * Lee el periodo de la URL. Sin fechas validas devuelve null (cada pantalla
 * decide su defecto). Con una sola, ese dia. Si vienen al reves, se dan vuelta.
 */
export function leerPeriodo(p: { desde?: string | null; hasta?: string | null }): Periodo | null {
  const d = p.desde && FORMATO_DIA.test(p.desde) ? p.desde : null;
  const h = p.hasta && FORMATO_DIA.test(p.hasta) ? p.hasta : null;
  if (!d && !h) return null;
  const a = d ?? h!;
  const b = h ?? d!;
  return a <= b ? { desde: a, hasta: b } : { desde: b, hasta: a };
}

export function urlPeriodo(ruta: string, { desde, hasta }: Periodo): string {
  return desde === hasta ? `${ruta}?desde=${desde}` : `${ruta}?desde=${desde}&hasta=${hasta}`;
}

export type Atajo = { texto: string; periodo: Periodo };

/** Los atajos de siempre, calculados contra hoy. */
export function atajosComunes(h = hoy()): Atajo[] {
  const ayer = sumarDias(h, -1);
  const finMesAnterior = sumarDias(primeroDeMes(h), -1);
  return [
    { texto: "Hoy", periodo: { desde: h, hasta: h } },
    { texto: "Ayer", periodo: { desde: ayer, hasta: ayer } },
    { texto: "Semana actual", periodo: { desde: lunes(h), hasta: h } },
    { texto: "Semana pasada", periodo: { desde: sumarDias(lunes(h), -7), hasta: sumarDias(lunes(h), -1) } },
    { texto: "Últimos 7 días", periodo: { desde: sumarDias(h, -6), hasta: h } },
    { texto: "Mes actual", periodo: { desde: primeroDeMes(h), hasta: h } },
    { texto: "Mes anterior", periodo: { desde: primeroDeMes(finMesAnterior), hasta: finMesAnterior } },
    { texto: "Últimos 30 días", periodo: { desde: sumarDias(h, -29), hasta: h } },
    { texto: "Año actual", periodo: { desde: `${h.slice(0, 4)}-01-01`, hasta: h } },
  ];
}

export const mismoPeriodo = (a: Periodo, b: Periodo) => a.desde === b.desde && a.hasta === b.hasta;

/** "jueves 15/10/2026" o "15/10/2026". El dia viene como texto: se formatea sin zona. */
export function nombreDia(dia: string, conDiaSemana = true): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    weekday: conDiaSemana ? "long" : undefined,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${dia}T12:00:00Z`));
}

/** "Jueves, 15/10/2026" o "Del 01/10/2026 al 15/10/2026". */
export function nombrePeriodo({ desde, hasta }: Periodo): string {
  if (desde === hasta) {
    const t = nombreDia(desde);
    return t[0].toUpperCase() + t.slice(1);
  }
  return `Del ${nombreDia(desde, false)} al ${nombreDia(hasta, false)}`;
}
