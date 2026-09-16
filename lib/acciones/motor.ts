import "server-only";
import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  avisos,
  config,
  estanterias,
  familias,
  modelos,
  movimientos,
  productos,
  reasignaciones,
  tandas,
  tarjetas,
  type Cemento,
  type Estado,
  type MotivoFraguado,
  type TipoMovimiento,
  type Trompo,
} from "../db/schema";
import type { Sesion } from "../session";
import {
  DIA_DE_LETRA,
  ETIQUETA_CEMENTO,
  FABRICADAS_POR_DEFECTO,
  claveFabricadas,
  codigoEstanteria,
  etiquetaPlaca,
  letraDelDia,
  nombreTanda,
  type Letra,
} from "../tarjetas";
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
    `La tanda ${nombreTanda(t)} ya no está ${comoLlego}: alguien la movió a ` +
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

/** Cuantas tarjetas de una letra existen fisicamente. */
export async function tarjetasFabricadas(tx: Tx | typeof db, letra: Letra): Promise<number> {
  const [c] = await tx.select().from(config).where(eq(config.clave, claveFabricadas(letra)));
  const n = c ? Number(c.valor) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : FABRICADAS_POR_DEFECTO[letra];
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
   * Para los movimientos que NO cambian de estado (correccion de un tipeo,
   * cambio de tarjeta): conserva `estadoDesde` para no llevarse puesto el tiempo
   * medido de ese tramo.
   */
  conservarInicioDeEstado?: boolean;
  /** No mide nada: la duracion queda `null` en vez de un numero sin sentido. */
  sinDuracion?: boolean;
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
  const duracionMin = m.sinDuracion
    ? null
    : Math.max(0, Math.round((ahora.getTime() - t.estadoDesde.getTime()) / 60000));

  await tx.insert(movimientos).values({
    tandaId: t.id,
    tandaCodigo: t.codigo,
    tandaPalabra: m.parche?.tarjetaPalabra !== undefined ? m.parche.tarjetaPalabra : t.tarjetaPalabra,
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
/* Estanterias y tarjetas: "libre" es una consulta, no un campo               */
/* -------------------------------------------------------------------------- */

/**
 * Tanda que hoy retiene una estanteria, si hay.
 *
 * "Libre" no es un estado guardado sino una consulta: una estanteria esta libre
 * cuando no hay tandas suyas en patio, horno ni a_desmoldar. Guardarlo como
 * campo obligaria a mantener dos verdades sincronizadas, y se despegan.
 */
async function tandaQueRetiene(tx: Tx, estanteriaId: number, excepto?: number) {
  const [t] = await tx
    .select()
    .from(tandas)
    .where(
      and(
        eq(tandas.estanteriaId, estanteriaId),
        inArray(tandas.estado, RETIENEN),
        excepto ? ne(tandas.id, excepto) : undefined,
      ),
    )
    .limit(1);
  return t ?? null;
}

/**
 * Primera tarjeta libre de una letra, de arriba para abajo.
 *
 * Bloquea las tarjetas de la letra antes de mirar cual esta libre: dos llenados
 * del mismo dia en el mismo instante esperan uno al otro en vez de llevarse la
 * misma. Igual el indice unico de la base es la ultima palabra.
 *
 * Devuelve `null` si no hay ninguna: el llenado NO se frena por eso. Frenar la
 * produccion porque faltan tarjetas seria peor que una tanda con codigo.
 */
async function primeraTarjetaLibre(tx: Tx, letra: Letra, excluir: number[] = []) {
  const fabricadas = await tarjetasFabricadas(tx, letra);
  await tx.select({ id: tarjetas.id }).from(tarjetas).where(eq(tarjetas.letra, letra)).for("update");

  const [libre] = await tx
    .select()
    .from(tarjetas)
    .where(
      and(
        eq(tarjetas.letra, letra),
        eq(tarjetas.activa, true),
        isNull(tarjetas.perdidaDesde),
        lte(tarjetas.orden, fabricadas),
        excluir.length ? sql`${tarjetas.id} not in (${sql.join(excluir.map((i) => sql`${i}`), sql`, `)})` : undefined,
        // En uso = colgada en una tanda que todavia no llego a listo.
        sql`not exists (
          select 1 from estanterias.tandas en_uso
          where en_uso.tarjeta_id = ${tarjetas.id} and en_uso.estado <> 'listo')`,
      ),
    )
    .orderBy(asc(tarjetas.orden))
    .limit(1);
  return libre ?? null;
}

/* -------------------------------------------------------------------------- */
/* Operaciones del circuito                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Llenado en el trompo: nace la tanda.
 *
 * El operario elige la ESTANTERIA CONCRETA que tiene adelante, por su placa, y
 * lo hace ANTES de volcar (ARQUITECTURA.md §10.5): la verificacion que importa
 * es la del cemento, y una verificacion que llega despues de volcar no sirve.
 */
export async function llenar(
  sesion: Sesion,
  datos: {
    estanteriaId: number;
    productoId: number;
    trompo: Trompo;
    moldesLlenados: number | null;
    confirmoLavado: boolean;
  },
) {
  return db.transaction(async (tx) => {
    // Bloquear la estanteria primero: dos llenados simultaneos sobre la misma
    // esperan uno al otro y el segundo encuentra que ya esta llena.
    const [est] = await tx
      .select({ e: estanterias, modelo: modelos.nombre, familia: familias.nombre })
      .from(estanterias)
      .innerJoin(modelos, eq(modelos.id, estanterias.modeloId))
      .innerJoin(familias, eq(familias.id, estanterias.familiaId))
      .where(eq(estanterias.id, datos.estanteriaId))
      .for("update", { of: estanterias });

    if (!est) fallar("Esa estantería no existe.");
    const etiqueta = etiquetaPlaca(est.modelo, est.familia, est.e.numero);
    if (!est.e.activa) fallar(`La estantería ${etiqueta} está dada de baja.`);

    const ocupante = await tandaQueRetiene(tx, est.e.id);
    if (ocupante) {
      fallar(
        `La estantería ${etiqueta} todavía tiene la tanda ${nombreTanda(ocupante)} ` +
          `sin desmoldar. Si en el piso está vacía, falta registrar el desmolde.`,
      );
    }

    const [prod] = await tx.select().from(productos).where(eq(productos.id, datos.productoId));
    if (!prod) fallar("Ese producto no existe.");
    if (!prod.activo) fallar(`El producto ${prod.nombre} está dado de baja.`);

    // La regla central: modelo, familia y cemento tienen que coincidir.
    if (prod.modeloId !== est.e.modeloId || prod.familiaId !== est.e.familiaId) {
      fallar(`${prod.nombre} no va en la estantería ${etiqueta}: es de otro modelo o de otra familia.`);
    }
    if (prod.cemento !== est.e.cemento) {
      fallar(
        `¡OJO! La estantería ${etiqueta} es de ${ETIQUETA_CEMENTO[est.e.cemento].toUpperCase()} ` +
          `y ${prod.nombre} es de ${ETIQUETA_CEMENTO[prod.cemento]}. No se pueden mezclar.`,
      );
    }

    // Aviso de lavado: si la ultima tanda de este trompo fue de otro cemento.
    const [ultima] = await tx
      .select({ cemento: tandas.cemento, creadaEn: tandas.creadaEn })
      .from(tandas)
      .where(eq(tandas.trompo, datos.trompo))
      .orderBy(desc(tandas.creadaEn))
      .limit(1);
    if (ultima && ultima.cemento !== prod.cemento && !datos.confirmoLavado) {
      fallar(
        `El trompo ${datos.trompo.toUpperCase()} viene de ${ETIQUETA_CEMENTO[ultima.cemento]}. ` +
          `Confirmá que se lavó antes de registrar.`,
      );
    }

    const moldes = datos.moldesLlenados ?? est.e.moldes;
    if (!Number.isInteger(moldes) || moldes < 1) {
      fallar("Cargá cuántos moldes llenaste. Tiene que ser 1 o más.");
    }
    if (moldes > est.e.moldes) {
      fallar(
        `La estantería ${etiqueta} tiene ${est.e.moldes} moldes: no podés llenar ${moldes}. ` +
          `Si el dato del sistema está mal, corregilo desde el panel.`,
      );
    }

    const ahora = new Date();
    const letra = letraDelDia(ahora);
    const tarjeta = await primeraTarjetaLibre(tx, letra);

    const [creada] = await tx
      .insert(tandas)
      .values({
        // Placeholder: el codigo definitivo sale del id, que recien existe
        // despues del insert. Se corrige abajo, dentro de la misma transaccion.
        codigo: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        estanteriaId: est.e.id,
        estanteriaEtiqueta: etiqueta,
        productoId: prod.id,
        productoNombre: prod.nombre,
        modeloNombre: est.modelo,
        familiaNombre: est.familia,
        cemento: prod.cemento,
        piezasPorMolde: prod.piezasPorMolde,
        piezasPorPaquete: prod.piezasPorPaquete,
        m2PorPaquete: prod.m2PorPaquete,
        trompo: datos.trompo,
        moldesNominal: est.e.moldes,
        moldesLlenados: moldes,
        tarjetaId: tarjeta?.id ?? null,
        tarjetaPalabra: tarjeta?.palabra ?? null,
        tarjetaLetra: tarjeta?.letra ?? null,
        tarjetaOrden: tarjeta?.orden ?? null,
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
      tandaPalabra: tarjeta?.palabra ?? null,
      productoNombre: prod.nombre,
      tipo: "llenado",
      estadoDesde: null,
      estadoHasta: "patio",
      usuarioId: sesion.id,
      usuarioNombre: sesion.nombre,
      // El llenado no mide nada anterior: la tanda no existia.
      duracionMin: null,
      trompo: datos.trompo,
      moldesLlenados: moldes,
      nota:
        ultima && ultima.cemento !== prod.cemento
          ? `Trompo con cambio de cemento: se confirmó el lavado.`
          : null,
      creadoEn: ahora,
    });

    return {
      tandaId: creada.id,
      codigo,
      etiqueta,
      moldes,
      palabra: tarjeta?.palabra ?? null,
      letra,
      orden: tarjeta?.orden ?? null,
      dia: DIA_DE_LETRA[letra].dia,
    };
  });
}

/**
 * El trompo no encontro en el tablero la tarjeta que indico la app.
 *
 * La tarjeta se marca como perdida -no se vuelve a asignar hasta que alguien la
 * encuentre- y la tanda toma la siguiente libre. Queda un aviso para la
 * recorrida y un movimiento que explica el cambio de palabra.
 *
 * Los movimientos anteriores de esa tanda pasan a decir la palabra nueva: la
 * vieja nunca estuvo colgada, asi que dejarla en el historial seria registrar
 * algo que no paso.
 */
export async function tarjetaNoEncontrada(sesion: Sesion, tandaId: number) {
  return db.transaction(async (tx) => {
    const [t] = await bloquear(tx, [tandaId]);
    if (!t.tarjetaId || !t.tarjetaLetra) fallar("Esa tanda no tiene tarjeta asignada.");
    if (t.estado !== "patio") {
      fallar(
        "Solo se puede cambiar la tarjeta recién llenada, mientras está en el patio. " +
          "Si se perdió después, avisale al administrador.",
      );
    }
    const vieja = t.tarjetaPalabra ?? "";
    const ahora = new Date();

    await tx.update(tarjetas).set({ perdidaDesde: ahora }).where(eq(tarjetas.id, t.tarjetaId));
    await tx.insert(avisos).values({
      tipo: "tarjeta_perdida",
      tandaId: t.id,
      tarjetaId: t.tarjetaId,
      texto: `No se encontró la tarjeta ${vieja} en el tablero al llenar.`,
      usuarioId: sesion.id,
      usuarioNombre: sesion.nombre,
      creadoEn: ahora,
    });

    const nueva = await primeraTarjetaLibre(tx, t.tarjetaLetra as Letra, [t.tarjetaId]);
    const parche = {
      tarjetaId: nueva?.id ?? null,
      tarjetaPalabra: nueva?.palabra ?? null,
      tarjetaLetra: nueva?.letra ?? t.tarjetaLetra,
      tarjetaOrden: nueva?.orden ?? null,
    };

    await aplicar(tx, t, {
      tipo: "cambio_tarjeta",
      hasta: t.estado,
      sesion,
      conservarInicioDeEstado: true,
      sinDuracion: true,
      nota: nueva
        ? `${vieja} no estaba en el tablero; se usó ${nueva.palabra}.`
        : `${vieja} no estaba en el tablero y no quedan tarjetas libres: la tanda sigue con su código.`,
      parche,
    });
    await tx
      .update(movimientos)
      .set({ tandaPalabra: nueva?.palabra ?? null })
      .where(eq(movimientos.tandaId, t.id));

    return { palabra: nueva?.palabra ?? null, orden: nueva?.orden ?? null, codigo: t.codigo };
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
 * se sella `estanteriaLiberadaEn`. La tarjeta pasa de la estanteria al palet.
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
 * En el desmolde, la placa que se ve no es la que la app dice.
 *
 * No mueve la tanda: queda un aviso abierto para la recorrida. Es el traspaso
 * critico -la tarjeta pasa al palet- y justo por eso no se puede resolver a
 * ciegas desde la pantalla del desmolde: alguien tiene que mirar el piso.
 */
export async function informarNoCoincide(sesion: Sesion, tandaId: number, placaVista: string) {
  const vista = placaVista.trim();
  if (!vista) fallar("Escribí qué dice la placa que tenés adelante.");
  return db.transaction(async (tx) => {
    const [t] = await bloquear(tx, [tandaId]);
    await tx.insert(avisos).values({
      tipo: "tarjeta_no_coincide",
      tandaId: t.id,
      tarjetaId: t.tarjetaId,
      texto:
        `La tarjeta ${nombreTanda(t)} debería estar en ${t.estanteriaEtiqueta ?? "(sin placa)"}, ` +
        `pero la placa dice: ${vista}.`,
      usuarioId: sesion.id,
      usuarioNombre: sesion.nombre,
    });
    return nombreTanda(t);
  });
}

/**
 * Empaque: se cuentan los paquetes y se cierra la tanda.
 *
 * Es el unico punto de conteo del sistema. Los productos que no pasan por el
 * tunel igual pasan por aca: si saltearan la estacion nunca se contarian y para
 * ellos la rotura no existiria. Al cerrar, la tarjeta vuelve a su gancho.
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

    return {
      paquetes: datos.paquetes,
      esperados,
      rotos,
      palabra: t.tarjetaPalabra,
      letra: t.tarjetaLetra,
      orden: t.tarjetaOrden,
      codigo: t.codigo,
    };
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

    // Volver atras un estado puede chocar con la realidad del piso: la
    // estanteria o la tarjeta ya pueden estar en otra tanda. Se avisa con nombre
    // y apellido en vez de dejar que la base lo rechace sin explicacion.
    if (RETIENEN.includes(datos.estado) && !RETIENEN.includes(t.estado) && t.estanteriaId) {
      const otra = await tandaQueRetiene(tx, t.estanteriaId, t.id);
      if (otra) {
        fallar(
          `No se puede volver ${nombreTanda(t)} a "${datos.estado.replace(/_/g, " ")}": su estantería ` +
            `ya tiene la tanda ${nombreTanda(otra)} sin desmoldar.`,
        );
      }
    }
    if (datos.estado !== "listo" && t.estado === "listo" && t.tarjetaId) {
      const [otra] = await tx
        .select()
        .from(tandas)
        .where(and(eq(tandas.tarjetaId, t.tarjetaId), ne(tandas.estado, "listo"), ne(tandas.id, t.id)))
        .limit(1);
      if (otra) {
        fallar(
          `No se puede reabrir esta tanda con la tarjeta ${t.tarjetaPalabra}: ya está colgada en ` +
            `la tanda ${otra.codigo}.`,
        );
      }
    }

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

/* -------------------------------------------------------------------------- */
/* Estanterias: alta, edicion y reasignacion                                  */
/* -------------------------------------------------------------------------- */

/**
 * Guarda una estanteria. Si cambia la familia o el cemento de una existente, es
 * una REASIGNACION (ARQUITECTURA.md §10.6): solo con la estanteria vacia y con
 * motivo, y queda registrada para poder medir su costo.
 *
 * El modelo de una estanteria existente no se cambia: es la forma fisica de los
 * moldes. Si es otro molde, es otra estanteria.
 */
export async function guardarEstanteria(
  sesion: Sesion,
  datos: {
    id: number | null;
    codigo: string | null;
    modeloId: number;
    familiaId: number;
    cemento: Cemento;
    numero: number;
    moldes: number;
    activa: boolean;
    motivo: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const [mod] = await tx.select().from(modelos).where(eq(modelos.id, datos.modeloId));
    const [fam] = await tx.select().from(familias).where(eq(familias.id, datos.familiaId));
    if (!mod) fallar("Elegí un modelo que exista.");
    if (!fam) fallar("Elegí una familia que exista.");
    const etiqueta = etiquetaPlaca(mod.nombre, fam.nombre, datos.numero);
    const codigo = datos.codigo?.trim() || codigoEstanteria(mod.nombre, fam.nombre, datos.numero);

    if (!datos.id) {
      await tx.insert(estanterias).values({
        codigo,
        modeloId: datos.modeloId,
        familiaId: datos.familiaId,
        cemento: datos.cemento,
        numero: datos.numero,
        moldes: datos.moldes,
      });
      return etiqueta;
    }

    const [actual] = await tx
      .select({ e: estanterias, familia: familias.nombre })
      .from(estanterias)
      .innerJoin(familias, eq(familias.id, estanterias.familiaId))
      .where(eq(estanterias.id, datos.id))
      .for("update", { of: estanterias });
    if (!actual) fallar("Esa estantería no existe.");

    if (actual.e.modeloId !== datos.modeloId) {
      fallar(
        "El modelo de una estantería no se cambia: es la forma de los moldes. " +
          "Si es otro juego de moldes, cargalo como estantería nueva.",
      );
    }

    const reasigna =
      actual.e.familiaId !== datos.familiaId || actual.e.cemento !== datos.cemento;
    const cambiaAlgoFisico = reasigna || !datos.activa;
    if (cambiaAlgoFisico) {
      const ocupante = await tandaQueRetiene(tx, actual.e.id);
      if (ocupante) {
        fallar(
          `La estantería tiene la tanda ${nombreTanda(ocupante)} sin desmoldar. ` +
            (reasigna
              ? "Cambiar familia o cemento solo se puede con la estantería vacía."
              : "Desmoldala antes de darla de baja."),
        );
      }
    }

    if (reasigna) {
      if (!datos.motivo?.trim()) {
        fallar(
          "Cambiar la familia o el cemento de una estantería es una reasignación: " +
            "escribí el motivo. Queda registrado para medir cuánto costó.",
        );
      }
      const [mAntes] = await tx.select().from(modelos).where(eq(modelos.id, actual.e.modeloId));
      await tx.insert(reasignaciones).values({
        estanteriaId: actual.e.id,
        etiquetaAntes: etiquetaPlaca(mAntes.nombre, actual.familia, actual.e.numero),
        etiquetaDespues: etiqueta,
        familiaAntes: actual.familia,
        familiaDespues: fam.nombre,
        cementoAntes: actual.e.cemento,
        cementoDespues: datos.cemento,
        motivo: datos.motivo.trim(),
        usuarioId: sesion.id,
        usuarioNombre: sesion.nombre,
      });
    }

    await tx
      .update(estanterias)
      .set({
        codigo,
        familiaId: datos.familiaId,
        cemento: datos.cemento,
        numero: datos.numero,
        moldes: datos.moldes,
        activa: datos.activa,
      })
      .where(eq(estanterias.id, actual.e.id));

    return etiqueta;
  });
}

/* -------------------------------------------------------------------------- */
/* Recorrida: avisos y tarjetas                                               */
/* -------------------------------------------------------------------------- */

export async function resolverAviso(sesion: Sesion, avisoId: number, resolucion: string) {
  if (!resolucion.trim()) fallar("Escribí qué se encontró o qué se hizo.");
  const r = await db
    .update(avisos)
    .set({ resueltoEn: new Date(), resueltoPor: sesion.nombre, resolucion: resolucion.trim() })
    .where(and(eq(avisos.id, avisoId), isNull(avisos.resueltoEn)))
    .returning({ id: avisos.id });
  if (!r.length) fallar("Ese aviso ya estaba resuelto. Actualizá la pantalla.");
}

/** Una tarjeta marcada como perdida aparecio: vuelve a poder asignarse. */
export async function tarjetaEncontrada(tarjetaId: number) {
  const r = await db
    .update(tarjetas)
    .set({ perdidaDesde: null })
    .where(eq(tarjetas.id, tarjetaId))
    .returning({ palabra: tarjetas.palabra });
  if (!r.length) fallar("Esa tarjeta no existe.");
  return r[0].palabra;
}

export async function guardarFabricadas(valores: Partial<Record<Letra, number>>) {
  for (const [letra, n] of Object.entries(valores)) {
    if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > 500) {
      fallar(`La cantidad de tarjetas de la ${letra} tiene que ser un número entero de 0 a 500.`);
    }
    await db
      .insert(config)
      .values({ clave: claveFabricadas(letra as Letra), valor: String(n) })
      .onConflictDoUpdate({ target: config.clave, set: { valor: String(n) } });
  }
}
