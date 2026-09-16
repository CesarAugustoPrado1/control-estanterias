import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import {
  avisos,
  config,
  estanterias,
  familias,
  modelos,
  motivosRotura,
  movimientos,
  productos,
  reasignaciones,
  tandas,
  tarjetas,
  usuarios,
  type Cemento,
  type Estado,
  type TipoMovimiento,
  type Trompo,
} from "./db/schema";
import { RETIENEN, capacidadHorno } from "./acciones/motor";
import {
  FABRICADAS_POR_DEFECTO,
  LETRAS,
  claveFabricadas,
  etiquetaPlaca,
  type Letra,
} from "./tarjetas";

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

/** Ficha completa de una tanda: sus datos y toda su linea de tiempo. */
export async function tandaPorCodigo(codigo: string) {
  const [t] = await db
    .select()
    .from(tandas)
    .where(sql`upper(${tandas.codigo}) = upper(${codigo})`);
  if (!t) return null;
  const [movs, est] = await Promise.all([
    db
      .select()
      .from(movimientos)
      .where(eq(movimientos.tandaId, t.id))
      .orderBy(asc(movimientos.creadoEn), asc(movimientos.id)),
    t.estanteriaId
      ? db.select().from(estanterias).where(eq(estanterias.id, t.estanteriaId))
      : Promise.resolve([]),
  ]);
  return { tanda: t, movimientos: movs, estanteria: est[0] ?? null };
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
      cemento: estanterias.cemento,
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
    .groupBy(modelos.id, modelos.nombre, familias.id, familias.nombre, estanterias.cemento)
    .orderBy(asc(modelos.orden), asc(modelos.nombre), asc(familias.orden), asc(estanterias.cemento));
}

/**
 * Lo que necesita la pantalla del trompo: todas las estanterias activas, si
 * estan libres, y para cada una los tonos que se pueden llenar en ella.
 *
 * "Se pueden llenar" es exactamente la regla del motor: mismo modelo, misma
 * familia y MISMO CEMENTO. Se calcula aca con el mismo criterio para que la
 * pantalla nunca ofrezca algo que el motor despues rechaza.
 */
export async function estanteriasParaTrompo() {
  const [ests, prods] = await Promise.all([
    db
      .select({
        e: estanterias,
        modelo: modelos.nombre,
        modeloOrden: modelos.orden,
        familia: familias.nombre,
        familiaOrden: familias.orden,
        ocupadaPor: sql<string | null>`(
          select coalesce(upper(t.tarjeta_palabra), t.codigo) from ${tandas} t
          where t.estanteria_id = ${estanterias.id}
            and t.estado in ('patio','horno','a_desmoldar')
          limit 1)`,
      })
      .from(estanterias)
      .innerJoin(modelos, eq(modelos.id, estanterias.modeloId))
      .innerJoin(familias, eq(familias.id, estanterias.familiaId))
      .where(eq(estanterias.activa, true))
      .orderBy(
        asc(modelos.orden),
        asc(modelos.nombre),
        asc(familias.orden),
        asc(familias.nombre),
        asc(estanterias.numero),
      ),
    db.select().from(productos).where(eq(productos.activo, true)).orderBy(asc(productos.nombre)),
  ]);

  return ests.map((x) => ({
    id: x.e.id,
    etiqueta: etiquetaPlaca(x.modelo, x.familia, x.e.numero),
    modelo: x.modelo,
    familia: x.familia,
    cemento: x.e.cemento,
    numero: x.e.numero,
    moldes: x.e.moldes,
    ocupadaPor: x.ocupadaPor,
    productos: prods
      .filter(
        (p) =>
          p.modeloId === x.e.modeloId &&
          p.familiaId === x.e.familiaId &&
          p.cemento === x.e.cemento,
      )
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        piezasPorMolde: p.piezasPorMolde,
        piezasPorPaquete: p.piezasPorPaquete,
        m2PorPaquete: p.m2PorPaquete,
      })),
  }));
}

/**
 * Cemento de la ultima tanda de cada trompo: con eso la pantalla sabe cuando
 * preguntar por el lavado. El motor lo vuelve a verificar al guardar.
 */
export async function ultimoCementoPorTrompo(): Promise<Record<Trompo, Cemento | null>> {
  const r = await db.execute(sql`
    select distinct on (trompo) trompo, cemento
    from ${tandas}
    order by trompo, creada_en desc`);
  const filas = r.rows as { trompo: Trompo; cemento: Cemento }[];
  return {
    a: filas.find((f) => f.trompo === "a")?.cemento ?? null,
    b: filas.find((f) => f.trompo === "b")?.cemento ?? null,
  };
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
      sql`(${movimientos.tandaCodigo} ilike ${t} or ${movimientos.tandaPalabra} ilike ${t} or ${movimientos.productoNombre} ilike ${t})`,
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
        select coalesce(upper(t.tarjeta_palabra), t.codigo) from ${tandas} t
        where t.estanteria_id = ${estanterias.id}
          and t.estado in ('patio','horno','a_desmoldar')
        order by t.creada_en desc limit 1)`,
      reasignaciones: sql<number>`(
        select count(*)::int from ${reasignaciones} r where r.estanteria_id = ${estanterias.id})`,
    })
    .from(estanterias)
    .innerJoin(modelos, eq(modelos.id, estanterias.modeloId))
    .innerJoin(familias, eq(familias.id, estanterias.familiaId))
    .orderBy(asc(modelos.orden), asc(modelos.nombre), asc(familias.orden), asc(estanterias.numero));
  return filas.map((f) => ({
    ...f.e,
    modelo: f.modelo,
    familia: f.familia,
    etiqueta: etiquetaPlaca(f.modelo, f.familia, f.e.numero),
    ocupadaPor: f.ocupadaPor,
    reasignaciones: Number(f.reasignaciones),
  }));
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

/* -------------------------------------------------------------------------- */
/* Recorrida y tarjetas                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Lo que DEBERIA verse en el piso ahora, para compararlo caminando.
 *
 * Es la defensa contra lo que se escapa: la identificacion es por lectura y no
 * por escaneo (§10.8), asi que los errores no se pueden prevenir todos, pero si
 * se pueden encontrar rapido. Una vez por dia, cinco minutos.
 */
export async function datosRecorrida() {
  const [vivas, abiertos, perdidas] = await Promise.all([
    db
      .select()
      .from(tandas)
      .where(sql`${tandas.estado} <> 'listo'`)
      .orderBy(asc(tandas.estadoDesde)),
    db
      .select({ a: avisos, palabra: tandas.tarjetaPalabra, codigo: tandas.codigo })
      .from(avisos)
      .leftJoin(tandas, eq(tandas.id, avisos.tandaId))
      .where(isNull(avisos.resueltoEn))
      .orderBy(desc(avisos.creadoEn)),
    db
      .select()
      .from(tarjetas)
      .where(isNotNull(tarjetas.perdidaDesde))
      .orderBy(asc(tarjetas.letra), asc(tarjetas.orden)),
  ]);
  return { vivas, avisos: abiertos, perdidas };
}

/**
 * Estado de todas las tarjetas, por letra: la vista del tablero de ganchos.
 *
 * Para cada tarjeta dice si deberia estar en su gancho (libre), colgada en una
 * tanda (en uso), perdida, o si todavia no se fabrico. Es lo que hay que
 * comparar con el tablero fisico para encontrar tarjetas que no volvieron.
 */
export async function estadoDeTarjetas() {
  const [todas, enUso, cfg] = await Promise.all([
    db.select().from(tarjetas).orderBy(asc(tarjetas.letra), asc(tarjetas.orden)),
    db
      .select({
        tarjetaId: tandas.tarjetaId,
        codigo: tandas.codigo,
        estado: tandas.estado,
        estadoDesde: tandas.estadoDesde,
        producto: tandas.productoNombre,
      })
      .from(tandas)
      .where(and(isNotNull(tandas.tarjetaId), sql`${tandas.estado} <> 'listo'`)),
    db.select().from(config),
  ]);

  const usoPorTarjeta = new Map(enUso.map((u) => [u.tarjetaId, u]));
  const fabricadas = Object.fromEntries(
    LETRAS.map((l) => {
      const c = cfg.find((x) => x.clave === claveFabricadas(l));
      const n = c ? Number(c.valor) : NaN;
      return [l, Number.isInteger(n) ? n : FABRICADAS_POR_DEFECTO[l]];
    }),
  ) as Record<Letra, number>;

  return {
    fabricadas,
    tarjetas: todas.map((t) => ({
      ...t,
      fabricada: t.orden <= fabricadas[t.letra as Letra],
      uso: usoPorTarjeta.get(t.id) ?? null,
    })),
  };
}
