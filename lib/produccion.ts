import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import type { UnidadSalida } from "./db/schema";
import { TZ } from "./tarjetas";

/**
 * Resumen de produccion por periodo, para pasar al ERP.
 *
 * Dos fotos del mismo periodo que NO son la misma produccion:
 *
 * - Llenado: lo que entro al circuito ese dia en el trompo (producto en
 *   proceso). Cuenta por la fecha del llenado.
 * - Empaquetado: lo que se cerro ese dia en empaque (producto terminado).
 *   Cuenta por la fecha del empaquetado, no la del llenado: lo empaquetado el
 *   jueves casi siempre se lleno el martes o el miercoles.
 *
 * Los dias son de calendario en hora de Argentina, con `desde` y `hasta`
 * incluidos. La salida "esperada" es la cuenta entera de siempre (ver
 * `convertir` en lib/estados.ts): moldes * piezas por molde / piezas por
 * paquete, truncado.
 */

/** "2026-10-15": formato de los <input type="date"> y de la URL. */
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

/**
 * El ultimo dia ANTERIOR a hoy en que hubo llenados o empaquetados. Un lunes
 * da el viernes (o el sabado, si se trabajo), no un domingo vacio. Si no hay
 * nada, ayer.
 */
export async function diaProductivoAnterior(): Promise<string> {
  const r = await db.execute(sql`
    with dias as (
      select (creada_en at time zone ${TZ})::date as dia from estanterias.tandas
      union all
      select (creado_en at time zone ${TZ})::date from estanterias.movimientos
      where tipo = 'empaquetado'
    )
    select to_char(max(dia), 'YYYY-MM-DD') as dia
    from dias
    where dia < (now() at time zone ${TZ})::date`);
  const dia = (r.rows[0] as { dia: string | null } | undefined)?.dia;
  return dia ?? sumarDias(hoy(), -1);
}

export type FilaLlenado = {
  modelo: string;
  productoId: number;
  producto: string;
  codigo: string | null;
  unidad: UnidadSalida;
  tandas: number;
  moldes: number;
  esperados: number;
  /** null si el producto no tiene m2 por paquete cargado. */
  m2: string | null;
};

export async function llenadoPorProducto(desde: string, hasta: string): Promise<FilaLlenado[]> {
  const r = await db.execute(sql`
    select t.modelo_nombre                                          as modelo,
           t.producto_id                                            as "productoId",
           max(t.producto_nombre)                                   as producto,
           max(p.codigo_plataforma_proceso)                         as codigo,
           t.unidad,
           count(*)::int                                            as tandas,
           sum(t.moldes_llenados)::int                              as moldes,
           sum(t.moldes_llenados * t.piezas_por_molde / t.piezas_por_paquete)::int as esperados,
           round(sum((t.moldes_llenados * t.piezas_por_molde / t.piezas_por_paquete) * t.m2_por_paquete), 2)::text as m2
    from estanterias.tandas t
    left join estanterias.productos p on p.id = t.producto_id
    where (t.creada_en at time zone ${TZ})::date between ${desde}::date and ${hasta}::date
    group by t.modelo_nombre, t.producto_id, t.unidad
    order by producto`);
  return r.rows as FilaLlenado[];
}

export type FilaEmpaque = FilaLlenado & {
  obtenidos: number;
  /** m2 de lo obtenido; `m2` (heredado) es el de lo esperado. */
  m2Obtenidos: string | null;
};

export async function empaquePorProducto(desde: string, hasta: string): Promise<FilaEmpaque[]> {
  // La fecha es la del ultimo empaquetado de cada tanda: si una correccion la
  // devolvio y se volvio a empaquetar, cuenta el dia en que quedo cerrada.
  const r = await db.execute(sql`
    with emp as (
      select distinct on (tanda_id) tanda_id, creado_en
      from estanterias.movimientos
      where tipo = 'empaquetado'
      order by tanda_id, creado_en desc
    )
    select t.modelo_nombre                                          as modelo,
           t.producto_id                                            as "productoId",
           max(t.producto_nombre)                                   as producto,
           max(p.codigo_plataforma_terminado)                       as codigo,
           t.unidad,
           count(*)::int                                            as tandas,
           sum(t.moldes_llenados)::int                              as moldes,
           sum(t.moldes_llenados * t.piezas_por_molde / t.piezas_por_paquete)::int as esperados,
           sum(t.paquetes)::int                                     as obtenidos,
           round(sum((t.moldes_llenados * t.piezas_por_molde / t.piezas_por_paquete) * t.m2_por_paquete), 2)::text as m2,
           round(sum(t.paquetes * t.m2_por_paquete), 2)::text       as "m2Obtenidos"
    from estanterias.tandas t
    join emp on emp.tanda_id = t.id
    left join estanterias.productos p on p.id = t.producto_id
    where t.paquetes is not null
      and (emp.creado_en at time zone ${TZ})::date between ${desde}::date and ${hasta}::date
    group by t.modelo_nombre, t.producto_id, t.unidad
    order by producto`);
  return r.rows as FilaEmpaque[];
}

/** Suma por unidad: sumar paquetes con unidades sueltas no dice nada. */
export function porUnidad<T extends { unidad: UnidadSalida }>(
  filas: T[],
  valor: (f: T) => number,
): Map<UnidadSalida, number> {
  const m = new Map<UnidadSalida, number>();
  for (const f of filas) m.set(f.unidad, (m.get(f.unidad) ?? 0) + valor(f));
  return m;
}

/** Suma de m2 que vienen como texto (numeric). null si ninguna fila tiene. */
export function sumaM2(valores: (string | null)[]): number | null {
  const con = valores.filter((v): v is string => v !== null);
  return con.length ? con.reduce((a, v) => a + Number(v), 0) : null;
}

/**
 * Periodo pedido en la URL. Sin fechas validas, el dia productivo anterior. Con
 * una sola, ese dia. Si vienen al reves, se dan vuelta.
 */
export async function resolverPeriodo(p: {
  desde?: string | null;
  hasta?: string | null;
}): Promise<{ desde: string; hasta: string; porDefecto: boolean }> {
  const d = p.desde && FORMATO_DIA.test(p.desde) ? p.desde : null;
  const h = p.hasta && FORMATO_DIA.test(p.hasta) ? p.hasta : null;
  if (!d && !h) {
    const dia = await diaProductivoAnterior();
    return { desde: dia, hasta: dia, porDefecto: true };
  }
  const a = d ?? h!;
  const b = h ?? d!;
  return a <= b ? { desde: a, hasta: b, porDefecto: false } : { desde: b, hasta: a, porDefecto: false };
}
