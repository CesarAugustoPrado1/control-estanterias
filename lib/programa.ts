import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "./db";
import {
  calendario,
  familias,
  gruposColor,
  tromposFuera,
  modelos,
  motivosIncumplimiento,
  productos,
  programaDias,
  programaLineas,
  type Cemento,
  type SeccionPrograma,
  type Trompo,
  type UnidadSalida,
} from "./db/schema";
import { hoy, nombreDia, sumarDias } from "./periodo";
import { esHabil, motivoDia, type Calendario } from "./calendario";
import { disponiblesEn, type PeriodoFuera } from "./lavados-previstos";
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
  /** Formula de color del producto (null: sin asignar). */
  grupoColorId: number | null;
  grupoColor: string | null;
  /** Solo llenado: trompo elegido; null = el trompo por defecto. */
  trompo: Trompo | null;
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
  /** Maquinadas que se quieren hacer ese dia, por seccion. */
  meta: Record<SeccionPrograma, number | null>;
};

/** Hechas por producto en un dia, de cada seccion. */
async function hechasDelDia(dia: string): Promise<Record<SeccionPrograma, Map<number, number>>> {
  const [llenado, desmolde] = await Promise.all([
    db.execute(sql`
      select producto_id as id, sum(peso)::float8 as n
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
      grupoColorId: productos.grupoColorId,
      grupoColor: gruposColor.nombre,
    })
    .from(programaLineas)
    .innerJoin(productos, eq(productos.id, programaLineas.productoId))
    .innerJoin(modelos, eq(modelos.id, productos.modeloId))
    .innerJoin(familias, eq(familias.id, productos.familiaId))
    .leftJoin(gruposColor, eq(gruposColor.id, productos.grupoColorId))
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
      grupoColorId: p.grupoColorId,
      grupoColor: p.grupoColor,
      trompo: l.trompo,
    };
  });

  const fuera: FueraDePrograma[] = [];
  for (const seccion of ["llenado", "desmolde"] as const) {
    for (const [productoId, n] of resto[seccion]) {
      if (n > 0) fuera.push({ seccion, productoId, producto: await nombreProducto(productoId), hechas: n });
    }
  }
  fuera.sort((a, b) => a.producto.localeCompare(b.producto));

  return {
    dia,
    cerrado,
    lineas,
    fuera,
    meta: { llenado: cab?.metaLlenado ?? null, desmolde: cab?.metaDesmolde ?? null },
  };
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
      familia: familias.nombre,
      cemento: productos.cemento,
      diasDesmolde: productos.diasDesmolde,
      grupoColorId: productos.grupoColorId,
      grupoColor: gruposColor.nombre,
    })
    .from(productos)
    .innerJoin(modelos, eq(modelos.id, productos.modeloId))
    .innerJoin(familias, eq(familias.id, productos.familiaId))
    .leftJoin(gruposColor, eq(gruposColor.id, productos.grupoColorId))
    .where(eq(productos.activo, true))
    .orderBy(asc(modelos.nombre), asc(productos.nombre));

/**
 * La ultima meta usada antes de ese dia, para sugerirla en un dia nuevo: casi
 * siempre se trabaja con la misma.
 */
export async function metasSugeridas(dia: string): Promise<Record<SeccionPrograma, number | null>> {
  const r = await db.execute(sql`
    select
      (select meta_llenado from estanterias.programa_dias
        where meta_llenado is not null and dia < ${dia}::date order by dia desc limit 1) as llenado,
      (select meta_desmolde from estanterias.programa_dias
        where meta_desmolde is not null and dia < ${dia}::date order by dia desc limit 1) as desmolde`);
  const f = r.rows[0] as { llenado: number | null; desmolde: number | null } | undefined;
  return { llenado: f?.llenado ?? null, desmolde: f?.desmolde ?? null };
}

/** Siguiente lugar al final de una seccion. */
export async function siguienteOrden(dia: string, seccion: SeccionPrograma) {
  const [r] = await db
    .select({ max: sql<number | null>`max(${programaLineas.orden})` })
    .from(programaLineas)
    .where(and(eq(programaLineas.dia, dia), eq(programaLineas.seccion, seccion)));
  return (r?.max ?? 0) + 1;
}

/* -------------------------------------------------------------------------- */
/* Tiempo de desmolde                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Cuantas maquinadas de cada producto van a estar listas para desmoldar un
 * dia, segun su tiempo de desmolde (ver `productos.diasDesmolde`).
 *
 * Se recorre dia por dia, desde hoy hasta ese dia:
 * - Cada maquinada queda lista el dia de su llenado + el tiempo de desmolde
 *   (las reales sin desmoldar y lo que falta llenar de lo programado).
 * - Cada dia anterior, lo programado para desmoldar se lleva lo que YA esta
 *   listo ese dia, y nada mas: un desmolde que no se va a poder hacer no le
 *   saca a lo que queda listo despues (ese ya tiene su propio aviso).
 * - Las lineas reprogramadas no cuentan: cuenta su copia en el dia nuevo.
 *
 * Es una estimacion para advertir, no una regla: en planta hay formas de
 * acelerar, por eso nada de esto bloquea.
 */
export type Disponibilidad = {
  dias: number;
  /** Cuantas van a estar listas para desmoldar ese dia. */
  listas: number;
  /** Llenados programados demasiado cerca del dia como para desmoldarlos ese dia. */
  tarde: { dia: string; cantidad: number }[];
};

export async function disponibilidadDesmolde(dia: string): Promise<Map<number, Disponibilidad>> {
  const h = hoy();
  const [prods, reales, lineas, deHoy] = await Promise.all([
    db.select({ id: productos.id, dias: productos.diasDesmolde }).from(productos),
    // Las reales sin desmoldar que llegan a estar listas para ese dia, por dia de llenado.
    db.execute(sql`
      select t.producto_id as id,
             to_char((t.creada_en at time zone ${TZ})::date, 'YYYY-MM-DD') as dia,
             sum(t.peso)::float8 as n
      from estanterias.tandas t
      join estanterias.productos p on p.id = t.producto_id
      where t.estado in ('patio', 'horno', 'a_desmoldar')
        and (t.creada_en at time zone ${TZ})::date <= ${dia}::date - p.dias_desmolde
      group by 1, 2`),
    // Lo programado desde hoy hasta ese dia: lo de dias futuros, entero.
    dia > h
      ? db
          .select()
          .from(programaLineas)
          .where(sql`${programaLineas.dia} > ${h}::date and ${programaLineas.dia} <= ${dia}::date`)
      : Promise.resolve([] as (typeof programaLineas.$inferSelect)[]),
    // Lo de hoy, con lo que ya se hizo descontado.
    leerDia(h),
  ]);
  const realesPorProducto = new Map<number, { dia: string; n: number }[]>();
  for (const r of reales.rows as { id: number; dia: string; n: number }[]) {
    const id = Number(r.id);
    if (!realesPorProducto.has(id)) realesPorProducto.set(id, []);
    realesPorProducto.get(id)!.push({ dia: r.dia, n: Number(r.n) });
  }
  const pendientes = [
    ...deHoy.lineas
      .filter((l) => !l.reprogramadaA)
      .map((l) => ({ dia: h, seccion: l.seccion, productoId: l.productoId, faltan: l.faltan })),
    ...lineas
      .filter((l) => !l.reprogramadaA)
      .map((l) => ({ dia: l.dia, seccion: l.seccion, productoId: l.productoId, faltan: l.cantidad })),
  ];

  const r = new Map<number, Disponibilidad>();
  for (const p of prods) {
    r.set(
      p.id,
      calcularListas({
        dia,
        hoy: h,
        dias: p.dias,
        reales: realesPorProducto.get(p.id) ?? [],
        pendientes: pendientes.filter((l) => l.productoId === p.id),
      }),
    );
  }
  return r;
}

/**
 * El recorrido dia por dia de `disponibilidadDesmolde`, para un producto.
 * Modulo aparte de la base para poder probarlo con casos armados a mano.
 */
export function calcularListas({
  dia,
  hoy: h,
  dias,
  reales,
  pendientes,
}: {
  dia: string;
  hoy: string;
  dias: number;
  /** Reales sin desmoldar, por dia de llenado. */
  reales: { dia: string; n: number }[];
  /** Lineas sin reprogramar desde hoy hasta ese dia, con lo que les falta. */
  pendientes: { dia: string; seccion: SeccionPrograma; faltan: number }[];
}): Disponibilidad {
  // Desde hoy (o desde ese dia, si ya paso): lo listo antes se junta en el primero.
  const desde = dia < h ? dia : h;
  const limite = sumarDias(dia, -dias);
  const sumar = (m: Map<string, number>, d: string, n: number) => m.set(d, (m.get(d) ?? 0) + n);
  // Cuantas quedan listas cada dia, y cuantas se piden desmoldar cada dia anterior.
  const quedanListas = new Map<string, number>();
  const pedidas = new Map<string, number>();
  for (const t of reales) {
    const lista = sumarDias(t.dia, dias);
    if (lista <= dia) sumar(quedanListas, lista < desde ? desde : lista, t.n);
  }
  const tarde: Disponibilidad["tarde"] = [];
  for (const l of pendientes) {
    if (l.faltan <= 0) continue;
    if (l.seccion === "llenado") {
      if (l.dia <= limite) sumar(quedanListas, sumarDias(l.dia, dias), l.faltan);
      else if (l.dia <= dia) tarde.push({ dia: l.dia, cantidad: l.faltan });
    } else if (l.dia < dia) {
      sumar(pedidas, l.dia, l.faltan);
    }
  }
  let listas = 0;
  for (let d = desde; d <= dia; d = sumarDias(d, 1)) {
    listas += quedanListas.get(d) ?? 0;
    if (d < dia) listas -= Math.min(listas, pedidas.get(d) ?? 0);
  }
  return { dias, listas, tarde };
}

const diaCorto = (d: string) =>
  nombreDia(d)
    .replace(/\/\d{4}$/, "")
    .replace(",", "");

/**
 * Advertencias para las lineas de desmolde de un dia: si piden mas de lo que va
 * a estar listo. Solo para hoy en adelante; lo pasado ya paso.
 */
export function advertenciasDesmolde(
  dia: string,
  lineas: LineaConAvance[],
  disp: Map<number, Disponibilidad>,
): Record<number, string> {
  const r: Record<number, string> = {};
  if (dia < hoy()) return r;
  const usado = new Map<number, number>();
  for (const l of lineas) {
    // Una reprogramada ya no se desmolda este dia: se desmolda su copia.
    if (l.seccion !== "desmolde" || l.faltan <= 0 || l.reprogramadaA) continue;
    const d = disp.get(l.productoId);
    if (!d) continue;
    const antes = usado.get(l.productoId) ?? 0;
    usado.set(l.productoId, antes + l.faltan);
    const quedan = Math.max(0, d.listas - antes);
    if (l.faltan <= quedan) continue;
    const plazo = d.dias === 1 ? "1 día" : `${d.dias} días`;
    let texto =
      quedan === 0
        ? `No va a haber ${l.producto} lista para desmoldar este día (tiempo mínimo de desmolde: ${plazo}).`
        : `Solo ${quedan === 1 ? "va a haber 1 lista" : `van a haber ${quedan} listas`} para desmoldar de las ${l.faltan} (tiempo mínimo de desmolde: ${plazo}).`;
    if (d.tarde.length) {
      texto +=
        " " +
        d.tarde
          .map(
            (t) =>
              `Las ${t.cantidad} que se llenan el ${diaCorto(t.dia)} se pueden desmoldar desde el ${diaCorto(sumarDias(t.dia, d.dias))}.`,
          )
          .join(" ");
    }
    r[l.id] = texto;
  }
  return r;
}

/**
 * Carga de desmolde de los proximos dias, para sugerir cuando desmoldar lo que
 * se programa llenar: cuantas maquinadas ya hay programadas para desmoldar cada
 * dia y la meta de desmolde. Un dia sin meta propia usa la ultima fijada antes,
 * que es la que se va a proponer cuando se arme ese dia.
 */
export type CargaDesmolde = Record<
  string,
  {
    programadas: number;
    meta: number | null;
    cerrado: boolean;
    /** Llenados programados ese dia: limitan el desmolde (ver lib/reglas.ts). */
    llenado: number;
    /** Dia habil (lunes a viernes, salvo lo que diga el calendario). */
    habil: boolean;
    /** "No se trabaja · Navidad", "Sábado: no se trabaja"... */
    motivo: string | null;
  }
>;

export async function cargaDesmolde(desde: string, dias = 45): Promise<CargaDesmolde> {
  const hasta = sumarDias(desde, dias);
  const [cabs, sumas, cal] = await Promise.all([
    db
      .select()
      .from(programaDias)
      .where(sql`${programaDias.dia} <= ${hasta}::date`)
      .orderBy(asc(programaDias.dia)),
    db
      .select({
        dia: programaLineas.dia,
        seccion: programaLineas.seccion,
        n: sql<number>`sum(${programaLineas.cantidad})::int`,
      })
      .from(programaLineas)
      .where(sql`${programaLineas.dia} between ${desde}::date and ${hasta}::date`)
      .groupBy(programaLineas.dia, programaLineas.seccion),
    leerCalendario(desde, hasta),
  ]);
  const porDia = new Map(cabs.map((c) => [c.dia, c]));
  const de = (seccion: string) =>
    new Map(sumas.filter((x) => x.seccion === seccion).map((x) => [x.dia, Number(x.n)]));
  const programadas = de("desmolde");
  const llenado = de("llenado");
  // Ultima meta fijada antes de `desde`, para arrastrar.
  let meta: number | null = null;
  for (const c of cabs) if (c.dia < desde && c.metaDesmolde !== null) meta = c.metaDesmolde;
  const r: CargaDesmolde = {};
  for (let i = 0; i <= dias; i++) {
    const d = sumarDias(desde, i);
    const cab = porDia.get(d);
    if (cab?.metaDesmolde != null) meta = cab.metaDesmolde;
    r[d] = {
      programadas: programadas.get(d) ?? 0,
      meta,
      cerrado: !!cab?.cerradoEn,
      llenado: llenado.get(d) ?? 0,
      habil: esHabil(d, cal),
      motivo: motivoDia(d, cal),
    };
  }
  return r;
}

/** Excepciones del calendario entre dos dias (ver lib/calendario.ts). */
export async function leerCalendario(desde: string, hasta: string): Promise<Calendario> {
  const filas = await db
    .select()
    .from(calendario)
    .where(sql`${calendario.dia} between ${desde}::date and ${hasta}::date`);
  return Object.fromEntries(filas.map((f) => [f.dia, { laborable: f.laborable, nombre: f.nombre }]));
}

/**
 * Llenados programados de varios dias, para ver en cual conviene poner un
 * producto: que grupos de color lleva cada trompo, cuanto hay programado y la
 * meta. Un dia sin meta propia usa la ultima fijada antes (como en el desmolde).
 */
export type CargaLlenado = Record<
  string,
  {
    lineas: { grupoId: number | null; trompo: Trompo | null }[];
    programadas: number;
    meta: number | null;
    cerrado: boolean;
    habil: boolean;
    /** Trompos en servicio ese dia. */
    disponibles: Trompo[];
  }
>;

export async function cargaLlenado(desde: string, hasta: string): Promise<CargaLlenado> {
  const [cabs, lineas, cal, fuera] = await Promise.all([
    db
      .select()
      .from(programaDias)
      .where(sql`${programaDias.dia} <= ${hasta}::date`)
      .orderBy(asc(programaDias.dia)),
    db
      .select({
        dia: programaLineas.dia,
        cantidad: programaLineas.cantidad,
        trompo: programaLineas.trompo,
        grupoId: productos.grupoColorId,
      })
      .from(programaLineas)
      .innerJoin(productos, eq(productos.id, programaLineas.productoId))
      .where(
        sql`${programaLineas.seccion} = 'llenado' and ${programaLineas.dia} between ${desde}::date and ${hasta}::date`,
      ),
    leerCalendario(desde, hasta),
    leerTromposFuera(desde, hasta),
  ]);
  const porDia = new Map(cabs.map((c) => [c.dia, c]));
  let meta: number | null = null;
  for (const c of cabs) if (c.dia < desde && c.metaLlenado !== null) meta = c.metaLlenado;
  const r: CargaLlenado = {};
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    const cab = porDia.get(d);
    if (cab?.metaLlenado != null) meta = cab.metaLlenado;
    const delDia = lineas.filter((l) => l.dia === d);
    r[d] = {
      lineas: delDia.map((l) => ({ grupoId: l.grupoId, trompo: l.trompo })),
      programadas: delDia.reduce((a, l) => a + l.cantidad, 0),
      meta,
      cerrado: !!cab?.cerradoEn,
      habil: esHabil(d, cal),
      disponibles: disponiblesEn(d, fuera),
    };
  }
  return r;
}

/**
 * Periodos de trompos fuera de servicio que tocan el rango (sin rango: los
 * vigentes y los que vienen, desde hoy).
 */
export async function leerTromposFuera(
  desde = hoy(),
  hasta?: string,
): Promise<(PeriodoFuera & { id: number; motivo: string | null; creadoPor: string | null })[]> {
  const filas = await db
    .select()
    .from(tromposFuera)
    .where(
      hasta
        ? sql`${tromposFuera.desde} <= ${hasta}::date and (${tromposFuera.hasta} is null or ${tromposFuera.hasta} >= ${desde}::date)`
        : sql`${tromposFuera.hasta} is null or ${tromposFuera.hasta} >= ${desde}::date`,
    )
    .orderBy(asc(tromposFuera.desde));
  return filas.map((f) => ({
    id: f.id,
    trompo: f.trompo,
    desde: f.desde,
    hasta: f.hasta,
    motivo: f.motivo,
    creadoPor: f.creadoPor,
  }));
}
