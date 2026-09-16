import "server-only";
import { and, asc, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import {
  estanterias,
  familias,
  modelos,
  motivosRotura,
  movimientos,
  productos,
  tandas,
  usuarios,
  type Estado,
  type TipoMovimiento,
} from "./db/schema";
import { RETIENEN, capacidadHorno } from "./acciones/motor";

/** TODAS las lecturas de pantalla viven aca. */

export type TandaEnCola = typeof tandas.$inferSelect;

/**
 * Cola de un estado. El orden por defecto es SIEMPRE por antiguedad: en
 * cualquier cola, lo que espera hace mas es lo que hay que atender.
 *
 * Las devoluciones de horno van primero aunque sean mas nuevas: ya vienen
 * demoradas y ademas retienen una estanteria que deberia estar produciendo.
 */
export async function cola(estado: Estado): Promise<TandaEnCola[]> {
  return db
    .select()
    .from(tandas)
    .where(eq(tandas.estado, estado))
    .orderBy(desc(tandas.rehornear), asc(tandas.estadoDesde));
}

/**
 * Cola de empaque, con si el producto pasa o no por el tunel.
 *
 * `requiereTunel` NO se copia a la tanda como los factores de conversion, y la
 * diferencia es deliberada: los factores entran en el calculo de la rotura, asi
 * que cambiarlos reescribiria el pasado. El tunel solo cambia lo que dice el
 * boton, asi que se lee del producto en vivo y listo.
 */
export async function colaEmpaque() {
  const filas = await db
    .select({ t: tandas, requiereTunel: productos.requiereTunel })
    .from(tandas)
    .innerJoin(productos, eq(productos.id, tandas.productoId))
    .where(eq(tandas.estado, "a_empaquetar"))
    .orderBy(desc(tandas.rehornear), asc(tandas.estadoDesde));
  return filas.map((f) => ({ ...f.t, requiereTunel: f.requiereTunel }));
}

export async function tandaPorId(id: number) {
  const [t] = await db.select().from(tandas).where(eq(tandas.id, id));
  if (!t) return null;
  const movs = await db
    .select()
    .from(movimientos)
    .where(eq(movimientos.tandaId, id))
    .orderBy(asc(movimientos.creadoEn), asc(movimientos.id));
  return { tanda: t, movimientos: movs };
}

/* -------------------------------------------------------------------------- */
/* Tablero                                                                    */
/* -------------------------------------------------------------------------- */

export async function resumenPorEstado() {
  const filas = await db
    .select({
      estado: tandas.estado,
      n: sql<number>`count(*)::int`,
      masVieja: sql<string | null>`min(${tandas.estadoDesde})`,
    })
    .from(tandas)
    .where(sql`${tandas.estado} <> 'listo'`)
    .groupBy(tandas.estado);

  const listas = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tandas)
    .where(
      and(
        eq(tandas.estado, "listo"),
        gte(tandas.estadoDesde, sql`now() - interval '7 days'`),
      ),
    );

  return { enCurso: filas, listasSemana: Number(listas[0]?.n ?? 0) };
}

/** Desglose de un estado por producto, para abrir un contador del tablero. */
export async function detallePorProducto(estado: Estado) {
  return db
    .select({
      producto: tandas.productoNombre,
      n: sql<number>`count(*)::int`,
      moldes: sql<number>`sum(${tandas.moldesLlenados})::int`,
      masVieja: sql<string>`min(${tandas.estadoDesde})`,
    })
    .from(tandas)
    .where(eq(tandas.estado, estado))
    .groupBy(tandas.productoNombre)
    .orderBy(asc(sql`min(${tandas.estadoDesde})`));
}

/* -------------------------------------------------------------------------- */
/* Moldes: la pregunta del trompo                                             */
/* -------------------------------------------------------------------------- */

/**
 * Cuantas estanterias hay libres de cada modelo+familia, y cuando se libera la
 * proxima de las que estan ocupadas.
 *
 * Es la pantalla mas valiosa del sistema: los moldes son el activo escaso, y la
 * pregunta operativa del trompo no es "que produzco" sino "con que puedo".
 *
 * `proximaLibre` es la tanda ocupante que hace mas que esta en el circuito: es
 * la candidata natural a desmoldarse primero, asi que es la mejor estimacion de
 * cuando se libera el proximo juego de moldes.
 */
export async function disponibilidadDeMoldes() {
  return db
    .select({
      modeloId: modelos.id,
      modelo: modelos.nombre,
      familiaId: familias.id,
      familia: familias.nombre,
      total: sql<number>`count(*)::int`,
      libres: sql<number>`count(*) filter (where not exists (
        select 1 from ${tandas} t
        where t.estanteria_id = ${estanterias.id}
          and t.estado in ('patio','horno','a_desmoldar')))::int`,
      moldes: sql<number>`sum(${estanterias.moldes})::int`,
    })
    .from(estanterias)
    .innerJoin(modelos, eq(modelos.id, estanterias.modeloId))
    .innerJoin(familias, eq(familias.id, estanterias.familiaId))
    .where(eq(estanterias.activa, true))
    .groupBy(modelos.id, modelos.nombre, familias.id, familias.nombre)
    .orderBy(asc(modelos.orden), asc(modelos.nombre), asc(familias.orden));
}

/** Productos que se pueden llenar ahora, con cuantas estanterias libres tienen. */
export async function productosParaLlenar() {
  const prods = await db
    .select({
      p: productos,
      modelo: modelos.nombre,
      modeloOrden: modelos.orden,
      familia: familias.nombre,
    })
    .from(productos)
    .innerJoin(modelos, eq(modelos.id, productos.modeloId))
    .innerJoin(familias, eq(familias.id, productos.familiaId))
    .where(eq(productos.activo, true))
    .orderBy(asc(modelos.orden), asc(productos.nombre));

  const disp = await disponibilidadDeMoldes();
  const clave = (m: number, f: number) => `${m}:${f}`;
  const porGrupo = new Map(disp.map((d) => [clave(d.modeloId, d.familiaId), d]));

  return prods.map((x) => {
    const g = porGrupo.get(clave(x.p.modeloId, x.p.familiaId));
    return {
      ...x.p,
      modelo: x.modelo,
      familia: x.familia,
      libres: g?.libres ?? 0,
      total: g?.total ?? 0,
      // Nominal representativo del grupo, para prellenar el formulario.
      moldesTipicos: g && g.total ? Math.round(g.moldes / g.total) : null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Horno                                                                      */
/* -------------------------------------------------------------------------- */

export async function panelHorno() {
  const [enPatio, adentro, cupo] = await Promise.all([
    cola("patio"),
    cola("horno"),
    capacidadHorno(),
  ]);
  return { enPatio, adentro, cupo, libres: Math.max(0, cupo - adentro.length) };
}

/* -------------------------------------------------------------------------- */
/* Historial                                                                  */
/* -------------------------------------------------------------------------- */

export type FiltroMovimientos = {
  tipo?: TipoMovimiento;
  usuarioId?: number;
  desde?: string;
  hasta?: string;
  texto?: string;
};

export function condicionesMovimientos(f: FiltroMovimientos): SQL[] {
  const w: SQL[] = [];
  if (f.tipo) w.push(eq(movimientos.tipo, f.tipo));
  if (f.usuarioId) w.push(eq(movimientos.usuarioId, f.usuarioId));
  if (f.desde) w.push(sql`${movimientos.creadoEn} >= ${f.desde}::date`);
  if (f.hasta) w.push(sql`${movimientos.creadoEn} < ${f.hasta}::date + interval '1 day'`);
  if (f.texto?.trim()) {
    const t = `%${f.texto.trim()}%`;
    w.push(
      sql`(${movimientos.tandaCodigo} ilike ${t} or ${movimientos.productoNombre} ilike ${t})`,
    );
  }
  return w;
}

export async function historial(f: FiltroMovimientos, pagina = 1, porPagina = 50) {
  const w = condicionesMovimientos(f);
  const where = w.length ? and(...w) : undefined;

  const [filas, total] = await Promise.all([
    db
      .select()
      .from(movimientos)
      .where(where)
      .orderBy(desc(movimientos.creadoEn), desc(movimientos.id))
      .limit(porPagina)
      .offset((pagina - 1) * porPagina),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(movimientos)
      .where(where),
  ]);

  return {
    filas,
    total: Number(total[0]?.n ?? 0),
    paginas: Math.max(1, Math.ceil(Number(total[0]?.n ?? 0) / porPagina)),
  };
}

/* -------------------------------------------------------------------------- */
/* Maestros para selectores                                                   */
/* -------------------------------------------------------------------------- */

export const listarFamilias = () =>
  db.select().from(familias).orderBy(asc(familias.orden), asc(familias.nombre));

export const listarModelos = () =>
  db.select().from(modelos).orderBy(asc(modelos.orden), asc(modelos.nombre));

export const listarMotivos = () =>
  db
    .select()
    .from(motivosRotura)
    .where(eq(motivosRotura.activo, true))
    .orderBy(asc(motivosRotura.nombre));

export const listarUsuarios = () =>
  db.select().from(usuarios).orderBy(asc(usuarios.nombre));

export async function listarProductos() {
  return db
    .select({
      p: productos,
      modelo: modelos.nombre,
      familia: familias.nombre,
    })
    .from(productos)
    .innerJoin(modelos, eq(modelos.id, productos.modeloId))
    .innerJoin(familias, eq(familias.id, productos.familiaId))
    .orderBy(asc(modelos.orden), asc(productos.nombre));
}

export async function listarEstanterias() {
  const filas = await db
    .select({
      e: estanterias,
      modelo: modelos.nombre,
      familia: familias.nombre,
      ocupadaPor: sql<string | null>`(
        select t.codigo from ${tandas} t
        where t.estanteria_id = ${estanterias.id}
          and t.estado in ('patio','horno','a_desmoldar')
        order by t.creada_en desc limit 1)`,
    })
    .from(estanterias)
    .innerJoin(modelos, eq(modelos.id, estanterias.modeloId))
    .innerJoin(familias, eq(familias.id, estanterias.familiaId))
    .orderBy(asc(estanterias.codigo));
  return filas.map((f) => ({ ...f.e, modelo: f.modelo, familia: f.familia, ocupadaPor: f.ocupadaPor }));
}

/** Tandas abiertas de una lista de estanterias: para avisar antes de dar de baja. */
export async function tandasAbiertasDe(estanteriaIds: number[]) {
  if (!estanteriaIds.length) return [];
  return db
    .select({ id: tandas.id, codigo: tandas.codigo, estanteriaId: tandas.estanteriaId })
    .from(tandas)
    .where(
      and(
        inArray(tandas.estanteriaId, estanteriaIds),
        inArray(tandas.estado, RETIENEN),
      ),
    );
}
