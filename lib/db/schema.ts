import {
  boolean,
  index,
  integer,
  numeric,
  pgSchema,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* -------------------------------------------------------------------------- */
/* Esquema propio                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Todo vive en el esquema `estanterias`, no en `public`.
 *
 * Compartimos la base con Control-Secaderos y eso tiene un riesgo concreto:
 * `drizzle-kit push` compara el archivo de esquema contra la base y PROPONE
 * BORRAR todo lo que no reconoce. Si esta app apuntara a `public`, un push
 * desde aca se llevaria puestas las tablas de la otra app.
 *
 * Con esquema propio + `schemaFilter: ["estanterias"]` en drizzle.config.ts,
 * push ni siquiera mira `public`. No es una precaucion, es una imposibilidad.
 *
 * De paso resuelve el choque de nombres: `usuarios`, `config` y `productos`
 * existen en las dos apps y no tienen nada que ver entre si.
 */
export const esq = pgSchema("estanterias");

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `desmolde` y `empaque` son roles separados a pedido de planta: son dos
 * puestos distintos y registran cosas distintas. Desmolde solo dice "ya se
 * desmoldo"; el conteo de paquetes lo hace empaque.
 *
 * `oficina` no opera nada: mira el resumen del dia.
 */
export const rolEnum = esq.enum("rol", [
  "admin",
  "trompo",
  "horno",
  "desmolde",
  "empaque",
  "oficina",
  "auditor",
]);

/**
 * El circuito de una tanda, de punta a punta.
 *
 * La estanteria queda RETENIDA en `patio`, `horno` y `a_desmoldar`, y se LIBERA
 * en el desmolde. Por eso la tanda sigue viva en `a_empaquetar` y `listo` sin
 * ocupar moldes: en la planta la estanteria vuelve al trompo el mismo dia
 * mientras las piezas todavia esperan el tunel.
 *
 * Esa es la razon por la que hay UNA sola entidad y no dos. Modelar las piezas
 * aparte agregaria una tabla y una maquina de estados para representar
 * exactamente la misma tanda.
 */
export const estadoEnum = esq.enum("estado_tanda", [
  "patio",
  "horno",
  "a_desmoldar",
  "a_empaquetar",
  "listo",
]);

export const trompoEnum = esq.enum("trompo", ["a", "b"]);

/**
 * Tipos de movimiento. Un tipo por cada cosa que se mida distinto.
 *
 * `fraguado_natural` es patio -> a_desmoldar sin pasar por el horno. No es una
 *   salida de horno y no puede registrarse como tal: toda la estadistica de
 *   horno mide `duracion_min` de las salidas, y estas tandas nunca estuvieron
 *   adentro. Contarlas meteria esperas de dos dias en el promedio de un ciclo
 *   de 24 horas.
 * `devolucion_horno` es una tanda que salio sin fraguar y vuelve a la cola. Es
 *   un hecho productivo, no un error de carga, y por eso no es `correccion`:
 *   mezclarlos haria imposible distinguir un problema de proceso de un error
 *   humano.
 * `correccion` es la valvula de escape del admin. Exige nota.
 */
export const tipoMovimientoEnum = esq.enum("tipo_movimiento", [
  "llenado",
  "entrada_horno",
  "salida_horno",
  "fraguado_natural",
  "devolucion_horno",
  "desmolde",
  "empaquetado",
  "correccion",
  /**
   * El trompo no encontro la tarjeta que indico la app y se le asigno otra. No
   * cambia de estado ni mide nada: queda para que el historial explique por que
   * una tanda cambio de palabra.
   */
  "cambio_tarjeta",
]);

/**
 * Cemento de un grupo de moldes y de un producto.
 *
 * Es la segunda regla de compatibilidad, independiente del color: Uhma beige con
 * cemento gris y Uhma beige con cemento blanco usan el mismo modelo y la misma
 * familia, pero sus moldes no se mezclan. Vive como dato propio y no dentro del
 * nombre de la familia porque es lo que PROHIBE fisicamente mezclar, porque es
 * una diferencia comercial (el blanco se hace a pedido) y porque se repite en
 * muchos modelos. Ver ARQUITECTURA.md 10.5.
 */
export const cementoEnum = esq.enum("cemento", ["gris", "blanco"]);

/**
 * Cosas que alguien en el piso vio que no cierran. No bloquean la operacion:
 * quedan abiertas para que el supervisor las resuelva en la recorrida.
 */
export const tipoAvisoEnum = esq.enum("tipo_aviso", [
  /** En el desmolde, la placa de la estanteria no es la que la app esperaba. */
  "tarjeta_no_coincide",
  /** El trompo no encontro en el tablero la tarjeta que indico la app. */
  "tarjeta_perdida",
]);

/**
 * Por que esta tanda se salteo el horno.
 *
 * Es obligatorio y no es un detalle de color: los dos motivos principales miden
 * cosas OPUESTAS. `horno_lleno` es capacidad perdida -el numero con el que se
 * justifica un horno nuevo-; `clima` es ahorro de energia. Promediarlos da un
 * numero que no sirve para decidir nada.
 */
export const motivoFraguadoEnum = esq.enum("motivo_fraguado", [
  "horno_lleno",
  "clima",
  "otro",
]);

/* -------------------------------------------------------------------------- */
/* Maestros                                                                   */
/* -------------------------------------------------------------------------- */

export const usuarios = esq.table(
  "usuarios",
  {
    id: serial("id").primaryKey(),
    usuario: text("usuario").notNull(),
    nombre: text("nombre").notNull(),
    pinHash: text("pin_hash").notNull(),
    rol: rolEnum("rol").notNull(),
    activo: boolean("activo").notNull().default(true),
    /**
     * Un PIN de 4 digitos son 10.000 combinaciones: sin freno se prueba entero
     * en minutos. Tras varios fallos seguidos el usuario queda bloqueado.
     */
    intentosFallidos: integer("intentos_fallidos").notNull().default(0),
    bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("usuarios_usuario_idx").on(t.usuario)],
);

/** La forma de la pieza: Kamba, Uhma, etc. Un modelo, un juego de moldes. */
export const modelos = esq.table("modelos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  activo: boolean("activo").notNull().default(true),
  orden: integer("orden").notNull().default(0),
});

/**
 * Familia de color: con que se puede compartir molde.
 *
 * No es lo mismo que el color del producto. Dos tonos de beige comparten los
 * mismos moldes, pero un gris y un beige no, y tampoco se mezclan moldes entre
 * cemento gris y cemento blanco. La familia es exactamente ese criterio de
 * compatibilidad, y por eso es una tabla y no un campo de texto en el producto:
 * es lo que restringe que estanteria puede llenarse con que producto.
 */
export const familias = esq.table("familias", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  activa: boolean("activa").notNull().default(true),
  orden: integer("orden").notNull().default(0),
});

/**
 * Producto = modelo (forma) x tono exacto.
 *
 * Las tres conversiones de unidad del negocio salen de dos enteros chicos,
 * usando la PIEZA como pivote:
 *
 *   caso mayoritario    1 molde = 1 paquete  -> 1 pieza/molde, 1 pieza/paquete
 *   dos moldes un paq.  2 moldes = 1 paquete -> 1 pieza/molde, 2 piezas/paquete
 *   un molde dos piezas                      -> 2 piezas/molde, 1 pieza/paquete
 *
 * Con `piezasPorPaquete = 2` y una cantidad impar de piezas queda una suelta
 * sin par. La pantalla lo dice en vez de redondear: es una pieza que despues
 * alguien va a buscar en el piso.
 *
 * `m2PorPaquete` va como `numeric` y no como float: los m2 son decimales
 * (0,26 m2) y la coma flotante no cierra al sumar miles de paquetes. Drizzle lo
 * devuelve como string, que es justamente lo que evita que alguien lo meta en
 * un `number` sin darse cuenta.
 */
export const productos = esq.table(
  "productos",
  {
    id: serial("id").primaryKey(),
    nombre: text("nombre").notNull(),
    modeloId: integer("modelo_id")
      .notNull()
      .references(() => modelos.id),
    familiaId: integer("familia_id")
      .notNull()
      .references(() => familias.id),
    piezasPorMolde: integer("piezas_por_molde").notNull().default(1),
    piezasPorPaquete: integer("piezas_por_paquete").notNull().default(1),
    /**
     * Si pasa o no por el tunel termocontraible.
     *
     * NO cambia la maquina de estados: TODA tanda pasa por la estacion de
     * empaque, porque ahi es donde se cuenta y el conteo es lo unico que
     * sostiene la medicion de rotura. Si los productos sin tunel saltearan la
     * estacion, nunca se contarian y para ellos la rotura no existiria. Esta
     * bandera solo cambia lo que dice la pantalla.
     */
    requiereTunel: boolean("requiere_tunel").notNull().default(true),
    /** Ver `cementoEnum`. Un producto de cemento blanco es otro producto. */
    cemento: cementoEnum("cemento").notNull().default("gris"),
    /** Unidad comercial. Es lo que convierte todo a m2. */
    m2PorPaquete: numeric("m2_por_paquete", { precision: 8, scale: 4 }),
    activo: boolean("activo").notNull().default(true),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("productos_modelo_familia_idx").on(t.modeloId, t.familiaId, t.cemento),
  ],
);

/**
 * Una estanteria es un GRUPO FIJO DE MOLDES, no un carro.
 *
 * Los 40 moldes de Kamba gris de una estanteria son siempre esos mismos 40, y
 * no se intercambian ni con los de otra estanteria del mismo producto. El
 * soporte fisico en cambio se cambia todo el tiempo, asi que la identidad viaja
 * con los moldes y no con el fierro: numerar el soporte seria numerar lo unico
 * que no se mantiene.
 *
 * Esta atada a modelo + familia, no a un producto: dos tonos de beige usan la
 * misma estanteria. El tono exacto lo define el paston y vive en la tanda.
 *
 * `moldes` es el nominal (39, 38, 40 segun la estanteria). Lo que se lleno de
 * verdad se carga en cada tanda, porque casi nunca alcanza la mezcla para
 * todos.
 */
export const estanterias = esq.table(
  "estanterias",
  {
    id: serial("id").primaryKey(),
    codigo: text("codigo").notNull(),
    modeloId: integer("modelo_id")
      .notNull()
      .references(() => modelos.id),
    familiaId: integer("familia_id")
      .notNull()
      .references(() => familias.id),
    moldes: integer("moldes").notNull(),
    /**
     * Compatibilidad = modelo + familia + cemento. Se marca en planta pintando
     * de blanco los laterales del contramolde, no en la placa: cambia mas seguido
     * que la familia. Solo se reasigna con la estanteria vacia (ver
     * `reasignaciones`).
     */
    cemento: cementoEnum("cemento").notNull().default("gris"),
    /**
     * Numero grabado en la placa: la placa dice MODELO · FAMILIA · NUMERO.
     *
     * Nullable solo por las filas cargadas antes de que existieran las placas; la
     * app lo exige al crear. Es unico dentro de modelo + familia, y no del
     * cemento, porque el cemento no esta en la placa: dos placas iguales en el
     * piso serian indistinguibles aunque una tenga los laterales pintados.
     */
    numero: integer("numero"),
    activa: boolean("activa").notNull().default(true),
    creadaEn: timestamp("creada_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("estanterias_codigo_idx").on(t.codigo),
    uniqueIndex("estanterias_placa_idx").on(t.modeloId, t.familiaId, t.numero),
    index("estanterias_modelo_familia_idx").on(t.modeloId, t.familiaId, t.cemento),
  ],
);

/**
 * Tarjetas de tanda: una palabra por tarjeta fisica. Ver ARQUITECTURA.md 10.3.
 *
 * `letra` es el dia del llenado (A lunes ... G domingo) y `orden` es la posicion
 * en la lista y en el tablero de ganchos. Siempre se asigna la primera libre de
 * arriba para abajo, asi que el orden importa mas que cualquier otra cosa: las
 * primeras salen todos los dias.
 *
 * Una tarjeta esta EN USO cuando hay una tanda suya que todavia no esta
 * `listo`: vuelve al gancho en el empaque. Igual que con las estanterias, "en
 * uso" es una consulta y no un campo, para no tener dos verdades.
 *
 * Cuantas existen fisicamente por letra no vive aca sino en `config`
 * (`tarjetas_fabricadas_A`...): se fabrican de a tandas, las primeras 25 o 30
 * primero, y la app no puede mandar a buscar una que no se hizo.
 */
export const tarjetas = esq.table(
  "tarjetas",
  {
    id: serial("id").primaryKey(),
    letra: text("letra").notNull(),
    orden: integer("orden").notNull(),
    palabra: text("palabra").notNull(),
    activa: boolean("activa").notNull().default(true),
    /**
     * Se marco como no encontrada en el tablero. No se asigna hasta que alguien
     * la encuentre y la destilde, y mientras tanto se usa la siguiente.
     */
    perdidaDesde: timestamp("perdida_desde", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("tarjetas_letra_orden_idx").on(t.letra, t.orden),
    uniqueIndex("tarjetas_palabra_idx").on(t.palabra),
  ],
);

export const motivosRotura = esq.table("motivos_rotura", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  activo: boolean("activo").notNull().default(true),
});

/* -------------------------------------------------------------------------- */
/* Tandas                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Una tanda es UN CICLO: un paston que llena una estanteria y termina en
 * paquetes listos. El codigo es correlativo y NO SE REUSA NUNCA.
 *
 * Es una mejora deliberada sobre Control-Secaderos, donde el historial tiene
 * "secadero 42" mil veces y hay que mirar la fecha para saber de cual se habla.
 * Aca un reclamo de calidad de hace tres meses se resuelve con un numero, y ese
 * numero es el que va escrito en la tarjeta colgada del soporte.
 */
export const tandas = esq.table(
  "tandas",
  {
    id: serial("id").primaryKey(),
    codigo: text("codigo").notNull(),

    /**
     * Que grupo de moldes se uso. NULLABLE a proposito.
     *
     * Hoy las estanterias de un mismo producto no se distinguen entre si en el
     * piso, asi que el sistema cuenta cuantas hay libres de cada modelo+familia
     * pero no pretende saber cual es cual. El dia que se marquen los grupos,
     * esta columna se empieza a llenar y aparecen las estadisticas de desgaste
     * por estanteria -que es informacion real, porque los moldes de un grupo
     * envejecen juntos-. Dejarla nullable desde el dia uno hace que ese cambio
     * no sea una migracion de datos.
     */
    estanteriaId: integer("estanteria_id").references(() => estanterias.id),

    productoId: integer("producto_id")
      .notNull()
      .references(() => productos.id),
    /** Snapshot: el historial se lee aunque despues se renombre el producto. */
    productoNombre: text("producto_nombre").notNull(),
    modeloNombre: text("modelo_nombre").notNull(),
    familiaNombre: text("familia_nombre").notNull(),

    /**
     * Snapshot de las conversiones vigentes al llenar.
     *
     * Es la columna que mas facil se olvida y la que mas caro sale. La rotura se
     * calcula como (moldes llenados -> paquetes esperados) menos paquetes
     * contados. Si el factor se leyera del producto al momento de CONSULTAR, el
     * dia que alguien corrija `piezasPorPaquete` se reescribiria en silencio la
     * rotura de todos los meses anteriores.
     */
    piezasPorMolde: integer("piezas_por_molde").notNull(),
    piezasPorPaquete: integer("piezas_por_paquete").notNull(),
    m2PorPaquete: numeric("m2_por_paquete", { precision: 8, scale: 4 }),

    trompo: trompoEnum("trompo").notNull(),

    /** Nominal de la estanteria al momento del llenado. */
    moldesNominal: integer("moldes_nominal"),
    /**
     * Moldes efectivamente llenados. Junto con `paquetes` es UNO DE LOS DOS
     * NUMEROS que sostienen toda la medicion de rotura, porque el desmolde no
     * cuenta nada. Casi siempre es uno o dos menos que el nominal, y el motivo
     * habitual es que no alcanzo la mezcla.
     */
    moldesLlenados: integer("moldes_llenados").notNull(),

    /**
     * Se completa recien en el empaquetado. Antes es `null`, que significa
     * "todavia no se conto" y NO es lo mismo que cero: una tanda sin contar no
     * es una tanda que dio cero paquetes.
     */
    paquetes: integer("paquetes"),
    motivoRoturaId: integer("motivo_rotura_id").references(
      () => motivosRotura.id,
    ),
    motivoRoturaNombre: text("motivo_rotura_nombre"),

    estado: estadoEnum("estado").notNull().default("patio"),
    estadoDesde: timestamp("estado_desde", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Cuando se libero la estanteria (momento del desmolde). Lo que define si un
     * grupo de moldes esta disponible es que no haya tandas suyas sin desmoldar,
     * asi que este campo es el que corta la retencion.
     */
    estanteriaLiberadaEn: timestamp("estanteria_liberada_en", {
      withTimezone: true,
    }),
    /**
     * Salio del horno sin fraguar y volvio a la cola. Se muestra tambien
     * mientras esta adentro, no solo en la cola: el hornero la ubica donde pueda
     * sacarla rapido.
     */
    rehornear: boolean("rehornear").notNull().default(false),

    /** Snapshot del cemento del producto al llenarse. */
    cemento: cementoEnum("cemento").notNull().default("gris"),
    /** Snapshot de lo que dice la placa: "UHMA · BEIGE · 03". */
    estanteriaEtiqueta: text("estanteria_etiqueta"),

    /**
     * Tarjeta colgada en la estanteria y despues en el palet. Nullable: las
     * tandas de antes de las tarjetas no tienen, y si un dia no queda ninguna
     * libre el llenado no se frena por eso (se usa el codigo).
     *
     * Palabra, letra y orden van como snapshot: el historial tiene que seguir
     * diciendo ABEJA aunque despues se cambie la palabra de esa tarjeta.
     */
    tarjetaId: integer("tarjeta_id").references(() => tarjetas.id),
    tarjetaPalabra: text("tarjeta_palabra"),
    tarjetaLetra: text("tarjeta_letra"),
    tarjetaOrden: integer("tarjeta_orden"),

    creadaEn: timestamp("creada_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tandas_codigo_idx").on(t.codigo),
    index("tandas_estado_idx").on(t.estado),
    index("tandas_producto_idx").on(t.productoId),
    index("tandas_creada_idx").on(t.creadaEn),
    /**
     * Las dos reglas fisicas del circuito, garantizadas por la base y no solo por
     * el codigo: una estanteria no puede tener dos tandas sin desmoldar, y una
     * tarjeta no puede estar colgada en dos tandas vivas. Si algun dia un bug o
     * una correccion lo intentara, la base lo rechaza en vez de dejar el piso y
     * el sistema diciendo cosas distintas.
     */
    uniqueIndex("tandas_estanteria_retenida_idx")
      .on(t.estanteriaId)
      .where(sql`estado in ('patio', 'horno', 'a_desmoldar')`),
    uniqueIndex("tandas_tarjeta_en_uso_idx")
      .on(t.tarjetaId)
      .where(sql`estado <> 'listo'`),
  ],
);

/**
 * Historial. Una fila por cambio de estado.
 *
 * `duracionMin` guarda cuanto duro el estado ANTERIOR y se calcula AL ESCRIBIR
 * contra `tandas.estadoDesde`. Asi la estadistica no reconstruye lineas de
 * tiempo tanda por tanda. La lectura es:
 *
 *   entrada_horno  -> cuanto espero en el patio
 *   salida_horno   -> cuanto tardo el horno de verdad
 *   desmolde       -> cuanto espero para desmoldarse
 *   empaquetado    -> cuanto espero para empaquetarse   <- el agujero a tapar
 */
export const movimientos = esq.table(
  "movimientos",
  {
    id: serial("id").primaryKey(),
    tandaId: integer("tanda_id")
      .notNull()
      .references(() => tandas.id),
    tandaCodigo: text("tanda_codigo").notNull(),
    /** Snapshot de la palabra de la tarjeta, para leer el historial como en el piso. */
    tandaPalabra: text("tanda_palabra"),
    productoNombre: text("producto_nombre").notNull(),

    tipo: tipoMovimientoEnum("tipo").notNull(),
    /** `null` solo en el `llenado`: antes de llenarse la tanda no existia. */
    estadoDesde: estadoEnum("estado_desde"),
    estadoHasta: estadoEnum("estado_hasta").notNull(),

    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    /**
     * Snapshot: el historial sigue legible si el usuario cambia de nombre. En el
     * llenado esto es el responsable de la carga del trompo.
     */
    usuarioNombre: text("usuario_nombre").notNull(),

    duracionMin: integer("duracion_min"),

    /** Solo en `llenado`. */
    trompo: trompoEnum("trompo"),
    moldesLlenados: integer("moldes_llenados"),
    /** Solo en `empaquetado`. */
    paquetes: integer("paquetes"),
    /** Solo en `fraguado_natural`, y ahi es obligatorio. Ver el enum. */
    motivoFraguado: motivoFraguadoEnum("motivo_fraguado"),

    nota: text("nota"),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("movimientos_tanda_idx").on(t.tandaId),
    index("movimientos_creado_idx").on(t.creadoEn),
    index("movimientos_tipo_idx").on(t.tipo),
  ],
);

/**
 * Discrepancias entre el piso y el sistema, informadas por quien las vio.
 *
 * Existen porque la identificacion es por lectura y no por escaneo (10.8): la
 * defensa contra un error que se escapa es que no pase en silencio. Se muestran
 * en la recorrida hasta que alguien las resuelve con una nota.
 */
export const avisos = esq.table(
  "avisos",
  {
    id: serial("id").primaryKey(),
    tipo: tipoAvisoEnum("tipo").notNull(),
    tandaId: integer("tanda_id").references(() => tandas.id),
    tarjetaId: integer("tarjeta_id").references(() => tarjetas.id),
    texto: text("texto").notNull(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    usuarioNombre: text("usuario_nombre").notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resueltoEn: timestamp("resuelto_en", { withTimezone: true }),
    resueltoPor: text("resuelto_por"),
    resolucion: text("resolucion"),
  },
  (t) => [index("avisos_abiertos_idx").on(t.resueltoEn)],
);

/**
 * Cambios de familia o de cemento de un grupo de moldes.
 *
 * Son decisiones de empresa, raras y con costo aceptado: las primeras tandas
 * despues del cambio salen manchadas. Se registran con motivo para poder MEDIR
 * ese costo (la rotura de las primeras tandas posteriores) y que la proxima vez
 * que se discuta un cambio haya un numero real. Ver ARQUITECTURA.md 10.6.
 */
export const reasignaciones = esq.table(
  "reasignaciones",
  {
    id: serial("id").primaryKey(),
    estanteriaId: integer("estanteria_id")
      .notNull()
      .references(() => estanterias.id),
    etiquetaAntes: text("etiqueta_antes").notNull(),
    etiquetaDespues: text("etiqueta_despues").notNull(),
    familiaAntes: text("familia_antes").notNull(),
    familiaDespues: text("familia_despues").notNull(),
    cementoAntes: cementoEnum("cemento_antes").notNull(),
    cementoDespues: cementoEnum("cemento_despues").notNull(),
    motivo: text("motivo").notNull(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    usuarioNombre: text("usuario_nombre").notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("reasignaciones_estanteria_idx").on(t.estanteriaId)],
);

/** Parametros editables por el admin. `capacidad_horno` = 18. */
export const config = esq.table("config", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull(),
});

/* -------------------------------------------------------------------------- */
/* Relaciones                                                                 */
/* -------------------------------------------------------------------------- */

export const productosRelations = relations(productos, ({ one }) => ({
  modelo: one(modelos, {
    fields: [productos.modeloId],
    references: [modelos.id],
  }),
  familia: one(familias, {
    fields: [productos.familiaId],
    references: [familias.id],
  }),
}));

export const estanteriasRelations = relations(estanterias, ({ one, many }) => ({
  modelo: one(modelos, {
    fields: [estanterias.modeloId],
    references: [modelos.id],
  }),
  familia: one(familias, {
    fields: [estanterias.familiaId],
    references: [familias.id],
  }),
  tandas: many(tandas),
}));

export const tandasRelations = relations(tandas, ({ one, many }) => ({
  estanteria: one(estanterias, {
    fields: [tandas.estanteriaId],
    references: [estanterias.id],
  }),
  producto: one(productos, {
    fields: [tandas.productoId],
    references: [productos.id],
  }),
  movimientos: many(movimientos),
}));

export const movimientosRelations = relations(movimientos, ({ one }) => ({
  tanda: one(tandas, {
    fields: [movimientos.tandaId],
    references: [tandas.id],
  }),
  usuario: one(usuarios, {
    fields: [movimientos.usuarioId],
    references: [usuarios.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/* Tipos                                                                      */
/* -------------------------------------------------------------------------- */

export type Rol = (typeof rolEnum.enumValues)[number];
export type Estado = (typeof estadoEnum.enumValues)[number];
export type Trompo = (typeof trompoEnum.enumValues)[number];
export type TipoMovimiento = (typeof tipoMovimientoEnum.enumValues)[number];
export type MotivoFraguado = (typeof motivoFraguadoEnum.enumValues)[number];

export type Usuario = typeof usuarios.$inferSelect;
export type Modelo = typeof modelos.$inferSelect;
export type Familia = typeof familias.$inferSelect;
export type Producto = typeof productos.$inferSelect;
export type Estanteria = typeof estanterias.$inferSelect;
export type Tanda = typeof tandas.$inferSelect;
export type Movimiento = typeof movimientos.$inferSelect;
export type MotivoRotura = typeof motivosRotura.$inferSelect;
export type Cemento = (typeof cementoEnum.enumValues)[number];
export type TipoAviso = (typeof tipoAvisoEnum.enumValues)[number];
export type Tarjeta = typeof tarjetas.$inferSelect;
export type Aviso = typeof avisos.$inferSelect;
export type Reasignacion = typeof reasignaciones.$inferSelect;
