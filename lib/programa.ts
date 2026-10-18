import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "./db";
import {
  familias,
  modelos,
  motivosIncumplimiento,
  productos,
  programaDias,
  programaLineas,
  type Cemento,
  type SeccionPrograma,
  type UnidadSalida,
} from "./db/schema";
import { TZ } from "./tarjetas";

/**
 * Programa de produccion: lo pedido para un dia contra lo hecho ese dia.
 *
 * Lo hecho no se carga a mano. Sale de lo que ya se registra:
 * - llenado: maquinadas llenadas ese dia, por producto;
 * - desmolde: maquinadas desmoldadas ese dia, por producto (el empaque va con
 *   el desmolde en la misma seccion de la hoja, pero lo que se mide es el
 *   desmolde, que es cuando la maquinada sale del circuito de moldes).
 *
 * Si hay dos lineas del mismo producto (dos clientes, por ejemplo), lo hecho
 * llena primero la de mas arriba. Lo que sobra es "fuera de programa".
 *
 * Cerrado el dia, cuenta la foto `hechasCierre`: el cumplimiento queda como
 * estaba al cerrar aunque despues se corrija alguna maquinada.
 */

export type LineaConAvance = {
  id: number;
  seccion: SeccionPrograma;
  productoId: number;
  producto: string;
  modelo: string;
  familia: string;
  cemento: Cemento;
  unidad: UnidadSalida;
  cantidad: number;
  nota: string | null;
  hechas: number;
  faltan: number;
  motivoId: number | null;
  motivoNombre: string | null;
  motivoNota: string | null;
  motivoPor: string | null;
  reprogramadaA: string | null;
  /** Dia de la linea de la que viene, si es una reprogramacion. */
  origenDia: string | null;
};

export type FueraDePrograma = {
  seccion: SeccionPrograma;
  productoId: number;
  producto: string;
  hechas: number;
};

export type DiaPrograma = {
  dia: string;
  cerrado: { en: Date; por: string | null } | null;
  lineas: LineaConAvance[];
  fuera: FueraDePrograma[];
};

/** Hechas por producto en un dia, de cada seccion. */
async function hechasDelDia(dia: string): Promise<Record<SeccionPrograma, Map<number, number>>> {
  const [llenado, desmolde] = await Promise.all([
    db.execute(sql`
      select producto_id as id, count(*)::int as n
      from estanterias.tandas
      where (creada_en at time zone ${TZ})::date = ${dia}::date
      group by producto_id`),
    db.execute(sql`
      select t.producto_id as id, count(distinct t.id)::int as n
      from estanterias.movimientos m
      join estanterias.tandas t on t.id = m.tanda_id
      where m.tipo = 'desmolde'
        and (m.creado_en at time zone ${TZ})::date = ${dia}::date
      group by t.producto_id`),
  ]);
  const aMapa = (r: { rows: unknown[] }) =>
    new Map((r.rows as { id: number; n: number }[]).map((f) => [Number(f.id), Number(f.n)]));
  return { llenado: aMapa(llenado), desmolde: aMapa(desmolde) };
}

const nombreProducto = (id: number) =>
  db
    .select({ nombre: productos.nombre })
    .from(productos)
    .where(eq(productos.id, id))
    .then((r) => r[0]?.nombre ?? "—");

export async function leerDia(dia: string): Promise<DiaPrograma> {
  const [cab] = await db.select().from(programaDias).where(eq(programaDias.dia, dia));
  const filas = await db
    .select({
      l: programaLineas,
      producto: productos.nombre,
      modelo: modelos.nombre,
      familia: familias.nombre,
      cemento: productos.cemento,
      unidad: productos.unidad,
    })
    .from(programaLineas)
    .innerJoin(productos, eq(productos.id, programaLineas.productoId))
    .innerJoin(modelos, eq(modelos.id, productos.modeloId))
    .innerJoin(familias, eq(familias.id, productos.familiaId))
    .where(eq(programaLineas.dia, dia))
    .orderBy(asc(programaLineas.seccion), asc(programaLineas.orden), asc(programaLineas.id));

  const origenes = filas.map((f) => f.l.origenId).filter((x): x is number => x !== null);
  const diaDeOrigen = new Map(
    origenes.length
      ? (
          await db
            .select({ id: programaLineas.id, dia: programaLineas.dia })
            .from(programaLineas)
            .where(inArray(programaLineas.id, origenes))
        ).map((o) => [o.id, o.dia])
      : [],
  );

  const cerrado = cab?.cerradoEn ? { en: cab.cerradoEn, por: cab.cerradoPor } : null;
  const hechas = await hechasDelDia(dia);
  // Lo que queda por repartir de cada producto, en cada seccion.
  const resto: Record<SeccionPrograma, Map<number, number>> = {
    llenado: new Map(hechas.llenado),
    desmolde: new Map(hechas.desmolde),
  };

  const lineas: LineaConAvance[] = filas.map(({ l, ...p }) => {
    let h: number;
    if (cerrado && l.hechasCierre !== null) {
      h = l.hechasCierre;
    } else {
      const disponible = resto[l.seccion].get(l.productoId) ?? 0;
      h = Math.min(disponible, l.cantidad);
    }
    // Aun cerrado se descuenta, para que lo de "fuera de programa" no cuente
    // dos veces lo que ya se atribuyo a una linea.
    const r = resto[l.seccion];
    r.set(l.productoId, Math.max(0, (r.get(l.productoId) ?? 0) - h));
    return {
      id: l.id,
      seccion: l.seccion,
      productoId: l.productoId,
      producto: p.producto,
      modelo: p.modelo,
      familia: p.familia,
      cemento: p.cemento,
      unidad: p.unidad,
      cantidad: l.cantidad,
      nota: l.nota,
      hechas: h,
      faltan: Math.max(0, l.cantidad - h),
      motivoId: l.motivoId,
      motivoNombre: l.motivoNombre,
      motivoNota: l.motivoNota,
      motivoPor: l.motivoPor,
      reprogramadaA: l.reprogramadaA,
      origenDia: l.origenId ? (diaDeOrigen.get(l.origenId) ?? null) : null,
    };
  });

  const fuera: FueraDePrograma[] = [];
  for (const seccion of ["llenado", "desmolde"] as const) {
    for (const [productoId, n] of resto[seccion]) {
      if (n > 0) fuera.push({ seccion, productoId, producto: await nombreProducto(productoId), hechas: n });
    }
  }
  fuera.sort((a, b) => a.producto.localeCompare(b.producto));

  return { dia, cerrado, lineas, fuera };
}

/** Cumplimiento: hechas sobre programadas, sin contar lo de mas. */
export function cumplimiento(lineas: { cantidad: number; hechas: number }[]) {
  const programadas = lineas.reduce((a, l) => a + l.cantidad, 0);
  const hechas = lineas.reduce((a, l) => a + Math.min(l.hechas, l.cantidad), 0);
  return { programadas, hechas, pct: programadas ? (100 * hechas) / programadas : null };
}

/** Los ultimos dias cerrados, para ver como viene el cumplimiento. */
export async function historialCerrados(limite = 14) {
  const dias = await db
    .select()
    .from(programaDias)
    .where(isNotNull(programaDias.cerradoEn))
    .orderBy(desc(programaDias.dia))
    .limit(limite);
  if (!dias.length) return [];
  const lineas = await db
    .select({
      dia: programaLineas.dia,
      seccion: programaLineas.seccion,
      cantidad: programaLineas.cantidad,
      hechas: programaLineas.hechasCierre,
    })
    .from(programaLineas)
    .where(
      inArray(
        programaLineas.dia,
        dias.map((d) => d.dia),
      ),
    );
  return dias.map((d) => {
    const de = (s?: SeccionPrograma) =>
      cumplimiento(
        lineas
          .filter((l) => l.dia === d.dia && (!s || l.seccion === s))
          .map((l) => ({ cantidad: l.cantidad, hechas: l.hechas ?? 0 })),
      );
    return { dia: d.dia, total: de(), llenado: de("llenado"), desmolde: de("desmolde") };
  });
}

export const listarMotivosIncumplimiento = (soloActivos = true) =>
  db
    .select()
    .from(motivosIncumplimiento)
    .where(soloActivos ? eq(motivosIncumplimiento.activo, true) : undefined)
    .orderBy(asc(motivosIncumplimiento.orden), asc(motivosIncumplimiento.nombre));

/** Productos activos para elegir al programar, con su modelo para agrupar. */
export const productosParaProgramar = () =>
  db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      modelo: modelos.nombre,
      cemento: productos.cemento,
    })
    .from(productos)
    .innerJoin(modelos, eq(modelos.id, productos.modeloId))
    .where(eq(productos.activo, true))
    .orderBy(asc(modelos.nombre), asc(productos.nombre));

/** Siguiente lugar al final de una seccion. */
export async function siguienteOrden(dia: string, seccion: SeccionPrograma) {
  const [r] = await db
    .select({ max: sql<number | null>`max(${programaLineas.orden})` })
    .from(programaLineas)
    .where(and(eq(programaLineas.dia, dia), eq(programaLineas.seccion, seccion)));
  return (r?.max ?? 0) + 1;
}
