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
 */

export const TROMPOS: Trompo[] = ["a", "b"];

export type LineaTrompo = { grupoId: number | null; trompo: Trompo | null };

export type Previstos = {
  total: number;
  porTrompo: Record<Trompo, { grupos: number[]; lavados: number }>;
  /** Lineas sin grupo de color: no entran en la cuenta. */
  sinGrupo: number;
};

export const trompoDe = (l: LineaTrompo, defecto: Trompo): Trompo => l.trompo ?? defecto;

export function lavadosPrevistos(lineas: LineaTrompo[], defecto: Trompo): Previstos {
  const porTrompo = { a: { grupos: [] as number[], lavados: 0 }, b: { grupos: [] as number[], lavados: 0 } };
  let sinGrupo = 0;
  for (const l of lineas) {
    if (l.grupoId === null) {
      sinGrupo++;
      continue;
    }
    const t = porTrompo[trompoDe(l, defecto)];
    if (!t.grupos.includes(l.grupoId)) t.grupos.push(l.grupoId);
  }
  for (const t of TROMPOS) porTrompo[t].lavados = Math.max(0, porTrompo[t].grupos.length - 1);
  return { total: porTrompo.a.lavados + porTrompo.b.lavados, porTrompo, sinGrupo };
}

/**
 * Cuantos lavados de mas suma agregar un producto de `grupoId` a un dia, y en
 * que trompo conviene. Va al trompo por defecto, salvo que el otro ya se use
 * ese dia y le cueste menos (por ejemplo, porque ya tiene ese grupo). No se
 * propone estrenar el otro trompo: usarlo suma su propio lavado de cierre.
 */
export function costoAgregar(
  lineas: LineaTrompo[],
  defecto: Trompo,
  grupoId: number | null,
): { costo: number; trompo: Trompo; yaTiene: boolean } {
  if (grupoId === null) return { costo: 0, trompo: defecto, yaTiene: false };
  const p = lavadosPrevistos(lineas, defecto).porTrompo;
  const costoEn = (t: Trompo) => (p[t].grupos.includes(grupoId) || p[t].grupos.length === 0 ? 0 : 1);
  const otro: Trompo = defecto === "a" ? "b" : "a";
  const usaOtro = p[otro].grupos.length > 0;
  const enDefecto = costoEn(defecto);
  if (usaOtro && costoEn(otro) < enDefecto) {
    return { costo: costoEn(otro), trompo: otro, yaTiene: p[otro].grupos.includes(grupoId) };
  }
  return { costo: enDefecto, trompo: defecto, yaTiene: p[defecto].grupos.includes(grupoId) };
}

/**
 * Orden de llenado que minimiza lavados: por trompo (el por defecto primero) y,
 * dentro de cada uno, todo lo de un grupo seguido, en el orden en que aparece
 * cada grupo por primera vez. Lo sin grupo va al final de su trompo.
 */
export function ordenarPorGrupo<L extends LineaTrompo & { id: number }>(lineas: L[], defecto: Trompo): L[] {
  const primero = new Map<string, number>();
  lineas.forEach((l, i) => {
    const k = `${trompoDe(l, defecto)}-${l.grupoId ?? "sin"}`;
    if (!primero.has(k)) primero.set(k, i);
  });
  const rangoTrompo = (l: L) => (trompoDe(l, defecto) === defecto ? 0 : 1);
  return lineas
    .map((l, i) => ({ l, i }))
    .sort((x, y) => {
      const t = rangoTrompo(x.l) - rangoTrompo(y.l);
      if (t) return t;
      const sx = x.l.grupoId === null ? 1 : 0;
      const sy = y.l.grupoId === null ? 1 : 0;
      if (sx !== sy) return sx - sy;
      const kx = primero.get(`${trompoDe(x.l, defecto)}-${x.l.grupoId ?? "sin"}`)!;
      const ky = primero.get(`${trompoDe(y.l, defecto)}-${y.l.grupoId ?? "sin"}`)!;
      return kx - ky || x.i - y.i;
    })
    .map((x) => x.l);
}

/**
 * Lavados con las lineas en el orden en que estan: cada vez que, dentro de un
 * trompo, una linea cambia de grupo respecto de la anterior con grupo. Si los
 * grupos estan intercalados da mas que `lavadosPrevistos`, que es el minimo.
 */
export function lavadosEnOrden(lineas: LineaTrompo[], defecto: Trompo): number {
  const ultimo: Record<Trompo, number | null> = { a: null, b: null };
  let n = 0;
  for (const l of lineas) {
    if (l.grupoId === null) continue;
    const t = trompoDe(l, defecto);
    if (ultimo[t] !== null && ultimo[t] !== l.grupoId) n++;
    ultimo[t] = l.grupoId;
  }
  return n;
}
