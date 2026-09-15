import "server-only";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  config,
  estanterias,
  familias,
  modelos,
  movimientos,
  productos,
  tandas,
  type Estado,
  type MotivoFraguado,
  type TipoMovimiento,
  type Trompo,
} from "../db/schema";
import type { Sesion } from "../session";
import { fallar } from "./comun";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Estados en los que la tanda todavia retiene su estanteria. */
export const RETIENEN: Estado[] = ["patio", "horno", "a_desmoldar"];

export const CAPACIDAD_HORNO_DEFECTO = 18;

/* -------------------------------------------------------------------------- */
/* Bloqueo y validacion                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `SELECT ... FOR UPDATE` sobre las tandas que se van a tocar.
 *
 * Es lo que evita que dos operarios con la pantalla abierta muevan la misma
 * tanda: el segundo espera a que el primero termine y despues falla la
 * validacion de estado con un mensaje concreto, en vez de pisar el movimiento.
 *
 * Toda operacion de flujo empieza aca. Sin el bloqueo, dos empaques simultaneos
 * de la misma tanda escribirian dos movimientos y el conteo quedaria duplicado.
 */
export async function bloquear(tx: Tx, ids: number[]) {
  if (!ids.length) fallar("No seleccionaste ninguna tanda.");
  const filas = await tx
    .select()
    .from(tandas)
    .where(inArray(tandas.id, ids))
    .for("update");
  if (filas.length !== ids.length) {
    fallar("Alguna de las tandas ya no existe. Actualizá la pantalla.");
  }
  // Orden estable para que los mensajes de error sean reproducibles.
  return filas.sort((a, b) => a.id - b.id);
}

export function exigirEstado(
  t: typeof tandas.$inferSelect,
  esperado: Estado,
  comoLlego: string,
) {
  if (t.estado === esperado) return;
  fallar(
    `La tanda ${t.codigo} ya no está ${comoLlego}: alguien la movió a ` +
      `"${t.estado.replace(/_/g, " ")}". Actualizá la pantalla.`,
  );
}

export async function capacidadHorno(): Promise<number> {
  const [c] = await db
    .select()
    .from(config)
    .where(eq(config.clave, "capacidad_horno"));
  const n = c ? Number(c.valor) : NaN;
  return Number.isInteger(n) && n > 0 ? n : CAPACIDAD_HORNO_DEFECTO;
}

/* -------------------------------------------------------------------------- */
/* Escritura de movimientos                                                   */
/* -------------------------------------------------------------------------- */

type Movida = {
  tipo: TipoMovimiento;
  hasta: Estado;
  sesion: Sesion;
  nota?: string | null;
  trompo?: Trompo | null;
  moldesLlenados?: number | null;
  paquetes?: number | null;
  motivoFraguado?: MotivoFraguado | null;
  /**
   * Para la correccion de admin que NO cambia de estado: conserva
   * `estadoDesde` para que arreglar un tipeo no se lleve puesto el tiempo de
   * horno medido de esa tanda.
   */
  conservarInicioDeEstado?: boolean;
  /** Campos extra a escribir en la tanda. */
  parche?: Partial<typeof tandas.$inferInsert>;
};

/**
 * Escribe el movimiento y actualiza la tanda. Unico camino por el que una tanda
 * cambia de estado: si alguna pantalla actualizara `tandas` por su cuenta, el
 * historial dejaria de reconstruir la realidad.
 */
export async function aplicar(
  tx: Tx,
  t: typeof tandas.$inferSelect,
  m: Movida,
) {
  const ahora = new Date();

  // Cuanto duro el estado ANTERIOR. Precalculado al escribir para que las
  // estadisticas no reconstruyan la linea de tiempo tanda por tanda.
  const duracionMin = Math.max(
    0,
    Math.round((ahora.getTime() - t.estadoDesde.getTime()) / 60000),
  );

  await tx.insert(movimientos).values({
    tandaId: t.id,
    tandaCodigo: t.codigo,
    productoNombre: t.productoNombre,
    tipo: m.tipo,
    estadoDesde: t.estado,
    estadoHasta: m.hasta,
    usuarioId: m.sesion.id,
    usuarioNombre: m.sesion.nombre,
    duracionMin,
    trompo: m.trompo ?? null,
    moldesLlenados: m.moldesLlenados ?? null,
    paquetes: m.paquetes ?? null,
    motivoFraguado: m.motivoFraguado ?? null,
    nota: m.nota ?? null,
    creadoEn: ahora,
  });

  await tx
    .update(tandas)
    .set({
      estado: m.hasta,
      ...(m.conservarInicioDeEstado ? {} : { estadoDesde: ahora }),
      ...(m.parche ?? {}),
    })
    .where(eq(tandas.id, t.id));
}

/* -------------------------------------------------------------------------- */
/* Estanterias libres                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Estanterias de un modelo+familia que no estan retenidas por ninguna tanda.
 *
 * "Libre" no es un estado guardado sino una consulta: una estanteria esta libre
 * cuando no hay tandas suyas en patio, horno ni a_desmoldar. Guardarlo como
 * campo obligaria a mantener dos verdades sincronizadas, y se despegan.
 */
export async function estanteriasLibres(
  tx: Tx | typeof db,
  modeloId: number,
  familiaId: number,
) {
  const ocupadas = tx
    .select({ id: tandas.estanteriaId })
    .from(tandas)
    .where(and(inArray(tandas.estado, RETIENEN), sql`${tandas.estanteriaId} is not null`));

  return tx
    .select()
    .from(estanterias)
    .where(
      and(
        eq(estanterias.modeloId, modeloId),
        eq(estanterias.familiaId, familiaId),
        eq(estanterias.activa, true),
        notInArray(estanterias.id, ocupadas),
      ),
    );
}

/* -------------------------------------------------------------------------- */
/* Operaciones del circuito                                                   */
/* -------------------------------------------------------------------------- */

/** Llenado en el trompo: nace la tanda. */
export async function llenar(
  sesion: Sesion,
  datos: { productoId: number; trompo: Trompo; moldesLlenados: number | null },
) {
  return db.transaction(async (tx) => {
    const [prod] = await tx
      .select({
        p: productos,
        modelo: modelos.nombre,
        familia: familias.nombre,
      })
      .from(productos)
      .innerJoin(modelos, eq(modelos.id, productos.modeloId))
      .innerJoin(familias, eq(familias.id, productos.familiaId))
      .where(eq(productos.id, datos.productoId));

    if (!prod) fallar("Ese producto no existe.");
    if (!prod.p.activo) fallar(`El producto ${prod.p.nombre} está dado de baja.`);

    // Bloquear las estanterias del grupo evita que dos llenados simultaneos del
    // mismo producto se lleven la misma, y que se pase del total disponible.
    await tx
      .select({ id: estanterias.id })
      .from(estanterias)
      .where(
        and(
          eq(estanterias.modeloId, prod.p.modeloId),
          eq(estanterias.familiaId, prod.p.familiaId),
        ),
      )
      .for("update");

    const libres = await estanteriasLibres(
      tx,
      prod.p.modeloId,
      prod.p.familiaId,
    );
    if (!libres.length) {
      fallar(
        `No hay estanterías libres de ${prod.modelo} ${prod.familia}: están ` +
          `todas en el circuito. Hay que desmoldar alguna antes de llenar otra.`,
      );
    }

    // La que hace mas que se libero: reparte el uso entre los grupos de moldes
    // en vez de castigar siempre al mismo.
    const usos = await tx
      .select({
        id: tandas.estanteriaId,
        ultimo: sql<string>`max(${tandas.creadaEn})`,
      })
      .from(tandas)
      .where(
        inArray(
          tandas.estanteriaId,
          libres.map((e) => e.id),
        ),
      )
      .groupBy(tandas.estanteriaId);
    const ultimoUso = new Map(usos.map((u) => [u.id, u.ultimo]));
    const est = [...libres].sort((a, b) => {
      const ua = ultimoUso.get(a.id) ?? "";
      const ub = ultimoUso.get(b.id) ?? "";
      return ua < ub ? -1 : ua > ub ? 1 : a.id - b.id;
    })[0];

    const moldes = datos.moldesLlenados ?? est.moldes;
    if (!Number.isInteger(moldes) || moldes < 1) {
      fallar("Cargá cuántos moldes llenaste. Tiene que ser 1 o más.");
    }
    if (moldes > est.moldes) {
      fallar(
        `Esa estantería tiene ${est.moldes} moldes: no podés llenar ${moldes}. ` +
          `Si el dato del sistema está mal, corregilo desde el panel.`,
      );
    }

    const ahora = new Date();
    const [creada] = await tx
      .insert(tandas)
      .values({
        // Placeholder: el codigo definitivo sale del id, que recien existe
        // despues del insert. Se corrige abajo, dentro de la misma transaccion.
        codigo: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        estanteriaId: est.id,
        productoId: prod.p.id,
        productoNombre: prod.p.nombre,
        modeloNombre: prod.modelo,
        familiaNombre: prod.familia,
        piezasPorMolde: prod.p.piezasPorMolde,
        piezasPorPaquete: prod.p.piezasPorPaquete,
        m2PorPaquete: prod.p.m2PorPaquete,
        trompo: datos.trompo,
        moldesNominal: est.moldes,
        moldesLlenados: moldes,
        estado: "patio",
        estadoDesde: ahora,
        creadaEn: ahora,
      })
      .returning();

    const codigo = `E-${String(creada.id).padStart(5, "0")}`;
    await tx.update(tandas).set({ codigo }).where(eq(tandas.id, creada.id));

    await tx.insert(movimientos).values({
      tandaId: creada.id,
      tandaCodigo: codigo,
      productoNombre: prod.p.nombre,
      tipo: "llenado",
      estadoDesde: null,
      estadoHasta: "patio",
      usuarioId: sesion.id,
      usuarioNombre: sesion.nombre,
      // El llenado no mide nada anterior: la tanda no existia.
      duracionMin: null,
      trompo: datos.trompo,
      moldesLlenados: moldes,
      creadoEn: ahora,
    });

    return { codigo, estanteria: est.codigo, moldes };
  });
}

export async function entrarAlHorno(sesion: Sesion, idsTanda: number[]) {
  const cupo = await capacidadHorno();
  return db.transaction(async (tx) => {
    const filas = await bloquear(tx, idsTanda);
    for (const t of filas) exigirEstado(t, "patio", "en el patio");

    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(tandas)
      .where(eq(tandas.estado, "horno"));
    if (Number(n) + filas.length > cupo) {
      fallar(
        `En el horno hay ${n} de ${cupo} lugares ocupados: no entran ` +
          `${filas.length} más. Sacá algo primero o meté menos.`,
      );
    }

    for (const t of filas) {
      await aplicar(tx, t, { tipo: "entrada_horno", hasta: "horno", sesion });
    }
    return filas.length;
  });
}

export async function salirDelHorno(sesion: Sesion, idsTanda: number[]) {
  return db.transaction(async (tx) => {
    const filas = await bloquear(tx, idsTanda);
    for (const t of filas) exigirEstado(t, "horno", "en el horno");
    for (const t of filas) {
      await aplicar(tx, t, {
        tipo: "salida_horno",
        hasta: "a_desmoldar",
        sesion,
        // Sale fraguada: si vuelve a entrar se vuelve a marcar.
        parche: { rehornear: false },
      });
    }
    return filas.length;
  });
}

export async function fraguadoNatural(
  sesion: Sesion,
  idsTanda: number[],
  motivo: MotivoFraguado,
  nota: string | null,
) {
  if (!motivo) {
    fallar(
      "Elegí por qué se saltea el horno. Es obligatorio: 'horno lleno' es " +
        "capacidad perdida y 'clima' es ahorro, y no se pueden promediar.",
    );
  }
  return db.transaction(async (tx) => {
    const filas = await bloquear(tx, idsTanda);
    for (const t of filas) exigirEstado(t, "patio", "en el patio");
    for (const t of filas) {
      await aplicar(tx, t, {
        tipo: "fraguado_natural",
        hasta: "a_desmoldar",
        sesion,
        motivoFraguado: motivo,
        nota,
      });
    }
    return filas.length;
  });
}

/**
 * Desmolde detecto que no fraguo: vuelve a la cola del horno, marcada.
 *
 * El que desmolda INFORMA un hecho; la operacion sobre el horno la hace el
 * hornero. Por eso vuelve a `patio` -la cola de entrada- y no directo a `horno`.
 */
export async function devolverAlHorno(
  sesion: Sesion,
  idsTanda: number[],
  nota: string | null,
) {
  return db.transaction(async (tx) => {
    const filas = await bloquear(tx, idsTanda);
    for (const t of filas) exigirEstado(t, "a_desmoldar", "esperando desmolde");
    for (const t of filas) {
      await aplicar(tx, t, {
        tipo: "devolucion_horno",
        hasta: "patio",
        sesion,
        nota,
        parche: { rehornear: true },
      });
    }
    return filas.length;
  });
}

/**
 * Desmolde: se separan moldes y piezas.
 *
 * No lleva cantidades a proposito -el conteo es del empaque-. Lo unico que pasa
 * aca, ademas del cambio de estado, es que la estanteria queda LIBRE: por eso
 * se sella `estanteriaLiberadaEn`.
 */
export async function desmoldar(sesion: Sesion, idsTanda: number[]) {
  return db.transaction(async (tx) => {
    const filas = await bloquear(tx, idsTanda);
    for (const t of filas) exigirEstado(t, "a_desmoldar", "esperando desmolde");
    const ahora = new Date();
    for (const t of filas) {
      await aplicar(tx, t, {
        tipo: "desmolde",
        hasta: "a_empaquetar",
        sesion,
        parche: { estanteriaLiberadaEn: ahora },
      });
    }
    return filas.length;
  });
}

/**
 * Empaque: se cuentan los paquetes y se cierra la tanda.
 *
 * Es el unico punto de conteo del sistema. Los productos que no pasan por el
 * tunel igual pasan por aca: si saltearan la estacion nunca se contarian y para
 * ellos la rotura no existiria.
 */
export async function empaquetar(
  sesion: Sesion,
  datos: {
    tandaId: number;
    paquetes: number | null;
    motivoRoturaId: number | null;
    motivoRoturaNombre: string | null;
    nota: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const [t] = await bloquear(tx, [datos.tandaId]);
    exigirEstado(t, "a_empaquetar", "esperando empaque");

    if (datos.paquetes === null) {
      fallar("Cargá cuántos paquetes salieron. Sin ese número no hay rotura.");
    }
    if (!Number.isInteger(datos.paquetes) || datos.paquetes < 0) {
      fallar("Los paquetes tienen que ser un número entero de 0 o más.");
    }

    const esperados = Math.floor(
      (t.moldesLlenados * t.piezasPorMolde) / t.piezasPorPaquete,
    );
    if (datos.paquetes > esperados) {
      fallar(
        `De ${t.moldesLlenados} moldes salen como máximo ${esperados} ` +
          `paquetes, y cargaste ${datos.paquetes}. Revisá el número, o corregí ` +
          `los moldes llenados desde el panel si el error viene del trompo.`,
      );
    }

    const rotos = esperados - datos.paquetes;
    if (rotos > 0 && !datos.motivoRoturaId) {
      fallar(
        `Faltan ${rotos} paquete(s) respecto de lo que se llenó: elegí el ` +
          `motivo de la rotura.`,
      );
    }

    await aplicar(tx, t, {
      tipo: "empaquetado",
      hasta: "listo",
      sesion,
      paquetes: datos.paquetes,
      nota: datos.nota,
      parche: {
        paquetes: datos.paquetes,
        motivoRoturaId: rotos > 0 ? datos.motivoRoturaId : null,
        motivoRoturaNombre: rotos > 0 ? datos.motivoRoturaNombre : null,
      },
    });

    return { paquetes: datos.paquetes, esperados, rotos };
  });
}

/**
 * Correccion de admin. Exige nota siempre: un cambio sin explicacion en el
 * historial es peor que el error que vino a arreglar.
 */
export async function corregir(
  sesion: Sesion,
  datos: {
    tandaId: number;
    estado: Estado;
    moldesLlenados: number | null;
    paquetes: number | null;
    nota: string;
  },
) {
  if (!datos.nota?.trim()) fallar("La corrección necesita una nota que la explique.");
  return db.transaction(async (tx) => {
    const [t] = await bloquear(tx, [datos.tandaId]);

    const mismoEstado = datos.estado === t.estado;
    const parche: Partial<typeof tandas.$inferInsert> = {};
    if (datos.moldesLlenados !== null) parche.moldesLlenados = datos.moldesLlenados;
    parche.paquetes = datos.paquetes;
    // Si la correccion la saca del tramo donde retenia la estanteria, hay que
    // sellar o limpiar la liberacion, o el conteo de libres queda mintiendo.
    if (RETIENEN.includes(datos.estado)) parche.estanteriaLiberadaEn = null;
    else if (!t.estanteriaLiberadaEn) parche.estanteriaLiberadaEn = new Date();

    await aplicar(tx, t, {
      tipo: "correccion",
      hasta: datos.estado,
      sesion,
      nota: datos.nota.trim(),
      // Arreglar un tipeo no puede llevarse puesto el tiempo de horno medido.
      conservarInicioDeEstado: mismoEstado,
      parche,
    });
    return t.codigo;
  });
}
