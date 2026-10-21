import type { Trompo } from "./db/schema";

/**
 * Lavados del trompo que se pueden prever con el programa. Modulo puro: lo
 * usan el servidor y el cliente.
 *
 * Cada vez que un trompo pasa de un grupo de color a otro hay que lavarlo. El
 * primer grupo del dia no cuenta (el trompo arranca limpio) y el lavado de fin
 * de jornada tampoco. Si se produce agrupado por color -todo lo de un grupo
 * seguido-, los lavados de mas de un trompo son sus grupos distintos menos uno.
 *
 * Solo cuentan los productos con grupo de color: sin grupo no se sabe.
 *
 * Todo se calcula con los trompos DISPONIBLES ese dia: lo que iba a un trompo
 * fuera de servicio pasa al otro.
 */

export const TROMPOS: Trompo[] = ["a", "b"];

export type LineaTrompo = { grupoId: number | null; trompo: Trompo | null };

/** El trompo por defecto y los que andan ese dia. */
export type Trompos = { defecto: Trompo; disponibles: Trompo[] };

export type PeriodoFuera = { trompo: Trompo; desde: string; hasta: string | null };

/** Trompos en servicio un dia. */
export function disponiblesEn(dia: string, fuera: PeriodoFuera[]): Trompo[] {
  return TROMPOS.filter((t) => !fuera.some((f) => f.trompo === t && f.desde <= dia && (!f.hasta || dia <= f.hasta)));
}

const otro = (t: Trompo): Trompo => (t === "a" ? "b" : "a");

/** El que hace de "por defecto" ese dia: si el por defecto esta parado, el otro. */
export function defectoDelDia(c: Trompos): Trompo {
  return c.disponibles.includes(c.defecto) || !c.disponibles.length ? c.defecto : otro(c.defecto);
}

/** En que trompo se llena de verdad una linea ese dia. */
export function trompoDe(l: LineaTrompo, c: Trompos): Trompo {
  const t = l.trompo ?? c.defecto;
  return c.disponibles.includes(t) || !c.disponibles.length ? t : otro(t);
}

export type Previstos = {
  total: number;
  porTrompo: Record<Trompo, { grupos: number[]; lavados: number }>;
  /** Lineas sin grupo de color: no entran en la cuenta. */
  sinGrupo: number;
};

export function lavadosPrevistos(lineas: LineaTrompo[], c: Trompos): Previstos {
  const porTrompo = { a: { grupos: [] as number[], lavados: 0 }, b: { grupos: [] as number[], lavados: 0 } };
  let sinGrupo = 0;
  for (const l of lineas) {
    if (l.grupoId === null) {
      sinGrupo++;
      continue;
    }
    const t = porTrompo[trompoDe(l, c)];
    if (!t.grupos.includes(l.grupoId)) t.grupos.push(l.grupoId);
  }
  for (const t of TROMPOS) porTrompo[t].lavados = Math.max(0, porTrompo[t].grupos.length - 1);
  return { total: porTrompo.a.lavados + porTrompo.b.lavados, porTrompo, sinGrupo };
}

/**
 * Cuantos lavados de mas suma agregar un producto de `grupoId` a un dia, y en
 * que trompo conviene. Va al trompo por defecto del dia, salvo que el otro
 * ande, ya se use ese dia y le cueste menos (por ejemplo, porque ya tiene ese
 * grupo). No se propone estrenar el otro trompo: suma su propio lavado de cierre.
 */
export function costoAgregar(
  lineas: LineaTrompo[],
  c: Trompos,
  grupoId: number | null,
): { costo: number; trompo: Trompo; yaTiene: boolean } {
  const base = defectoDelDia(c);
  if (grupoId === null) return { costo: 0, trompo: base, yaTiene: false };
  const p = lavadosPrevistos(lineas, c).porTrompo;
  const costoEn = (t: Trompo) => (p[t].grupos.includes(grupoId) || p[t].grupos.length === 0 ? 0 : 1);
  const alt = otro(base);
  const usaAlt = c.disponibles.includes(alt) && p[alt].grupos.length > 0;
  if (usaAlt && costoEn(alt) < costoEn(base)) {
    return { costo: costoEn(alt), trompo: alt, yaTiene: p[alt].grupos.includes(grupoId) };
  }
  return { costo: costoEn(base), trompo: base, yaTiene: p[base].grupos.includes(grupoId) };
}

/**
 * Orden de llenado que minimiza lavados: por trompo (el del dia primero) y,
 * dentro de cada uno, todo lo de un grupo seguido, en el orden en que aparece
 * cada grupo por primera vez. Lo sin grupo va al final de su trompo.
 */
export function ordenarPorGrupo<L extends LineaTrompo & { id: number }>(lineas: L[], c: Trompos): L[] {
  const base = defectoDelDia(c);
  const clave = (l: L) => `${trompoDe(l, c)}-${l.grupoId ?? "sin"}`;
  const primero = new Map<string, number>();
  lineas.forEach((l, i) => {
    if (!primero.has(clave(l))) primero.set(clave(l), i);
  });
  const rangoTrompo = (l: L) => (trompoDe(l, c) === base ? 0 : 1);
  return lineas
    .map((l, i) => ({ l, i }))
    .sort((x, y) => {
      const t = rangoTrompo(x.l) - rangoTrompo(y.l);
      if (t) return t;
      const sx = x.l.grupoId === null ? 1 : 0;
      const sy = y.l.grupoId === null ? 1 : 0;
      if (sx !== sy) return sx - sy;
      return primero.get(clave(x.l))! - primero.get(clave(y.l))! || x.i - y.i;
    })
    .map((x) => x.l);
}

/**
 * Lavados con las lineas en el orden en que estan: cada vez que, dentro de un
 * trompo, una linea cambia de grupo respecto de la anterior con grupo. Si los
 * grupos estan intercalados da mas que `lavadosPrevistos`, que es el minimo.
 */
export function lavadosEnOrden(lineas: LineaTrompo[], c: Trompos): number {
  const ultimo: Record<Trompo, number | null> = { a: null, b: null };
  let n = 0;
  for (const l of lineas) {
    if (l.grupoId === null) continue;
    const t = trompoDe(l, c);
    if (ultimo[t] !== null && ultimo[t] !== l.grupoId) n++;
    ultimo[t] = l.grupoId;
  }
  return n;
}
