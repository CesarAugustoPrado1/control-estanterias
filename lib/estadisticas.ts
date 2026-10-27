import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import type { Periodo } from "./periodo";
import { TZ } from "./tarjetas";

/**
 * Agregaciones. Tres criterios que atraviesan todo el modulo:
 *
 * 1. Las consultas FILTRAN EXPLICITAMENTE por tipo de movimiento. Un tipo nuevo
 *    queda afuera de los calculos viejos por defecto, que es el comportamiento
 *    correcto: si se mide distinto, es otra cosa.
 *
 * 2. La rotura NUNCA se agrupa por el usuario del empaque. El empaque no genera
 *    rotura, solo la evidencia -el grueso se rompe en el desmolde-, asi que
 *    atribuirsela seria culpar justo al unico que no la causo. Se abre por
 *    producto, trompo, maquinista y desmoldador: quien hizo la tarea, no el
 *    usuario de la app que la registro.
 *
 * 3. Los m2 se suman en SQL con `numeric`. Pasarlos por float antes de sumar
 *    es exactamente lo que se quiso evitar al elegir el tipo de la columna.
 */

/**
 * Todo se consulta por periodo de calendario (dias en hora de Argentina, los
 * dos extremos incluidos). Ver lib/periodo.ts.
 */
const enPeriodo = (columna: SQL, { desde, hasta }: Periodo) =>
  sql`(${columna} at time zone ${TZ})::date between ${desde}::date and ${hasta}::date`;

/* -------------------------------------------------------------------------- */

export async function tiemposPorEtapa(p: Periodo) {
  const r = await db.execute(sql`
    select tipo,
           count(*)::int                                as n,
           round(avg(duracion_min)::numeric / 60, 1)    as prom,
           round(min(duracion_min)::numeric / 60, 1)    as minimo,
           round(max(duracion_min)::numeric / 60, 1)    as maximo,
           round((percentile_cont(0.5) within group (order by duracion_min))::numeric / 60, 1) as mediana
    from estanterias.movimientos
    where duracion_min is not null
      and ${enPeriodo(sql`creado_en`, p)}
      and tipo in ('entrada_horno','salida_horno','desmolde','empaquetado','fraguado_natural')
    group by tipo
  `);
  return r.rows as {
    tipo: string;
    n: number;
    prom: string;
    minimo: string;
    maximo: string;
    mediana: string;
  }[];
}

/**
 * Tiempo de horno abierto por producto. Solo `salida_horno`: el fraguado
 * natural nunca estuvo adentro y meterlo aca arruinaria el unico numero que
 * dice cuanto hay que hornear de verdad.
 */
export async function tiempoDeHorno(p: Periodo) {
  const r = await db.execute(sql`
    select producto_nombre                              as producto,
           count(*)::int                                as ciclos,
           round(avg(duracion_min)::numeric / 60, 1)    as prom,
           round(min(duracion_min)::numeric / 60, 1)    as minimo,
           round(max(duracion_min)::numeric / 60, 1)    as maximo
    from estanterias.movimientos
    where tipo = 'salida_horno'
      and duracion_min is not null
      and ${enPeriodo(sql`creado_en`, p)}
    group by producto_nombre
    order by producto_nombre
  `);
  return r.rows as {
    producto: string;
    ciclos: number;
    prom: string;
    minimo: string;
    maximo: string;
  }[];
}

/**
 * Tandas que necesitaron devolucion contra las que no.
 *
 * La diferencia entre las dos duraciones es el tiempo MINIMO REAL de horno,
 * medido y no estimado: por debajo de ese numero hay que volver a meterlas.
 */
export async function efectoDeLaDevolucion(p: Periodo) {
  const r = await db.execute(sql`
    with ciclos as (
      select m.tanda_id,
             m.duracion_min,
             exists (
               select 1 from estanterias.movimientos d
               where d.tanda_id = m.tanda_id and d.tipo = 'devolucion_horno'
             ) as volvio
      from estanterias.movimientos m
      where m.tipo = 'salida_horno'
        and m.duracion_min is not null
        and ${enPeriodo(sql`m.creado_en`, p)}
    )
    select volvio,
           count(*)::int                             as n,
           round(avg(duracion_min)::numeric / 60, 1) as prom
    from ciclos group by volvio
  `);
  return r.rows as { volvio: boolean; n: number; prom: string }[];
}

/* -------------------------------------------------------------------------- */
/* Rotura                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Base de todas las roturas. La fecha que cuenta es la del EMPAQUETADO (el
 * ultimo, si una correccion la reabrio): es cuando la rotura se conoce, y es la
 * misma que usa la pantalla de Produccion, asi los dos numeros coinciden.
 *
 * Devuelve el SELECT con su WHERE ya armado: cada consulta agrega su GROUP BY.
 */
const roturaPor = (campo: SQL, p: Periodo) => sql`
  select ${campo}                                       as clave,
         sum(peso)::float8                              as tandas,
         -- Sin floor(): en Postgres la division entre enteros ya trunca, y
         -- floor() devuelve double precision, que despues rompe round(x, 2)
         -- porque no existe round(double precision, integer).
         sum(moldes_llenados * piezas_por_molde / piezas_por_paquete)::int as esperados,
         sum(paquetes)::int                             as reales,
         round(
           100.0 * (sum(moldes_llenados * piezas_por_molde / piezas_por_paquete) - sum(paquetes))
           / nullif(sum(moldes_llenados * piezas_por_molde / piezas_por_paquete), 0)
         , 2)                                           as pct,
         round(sum(
           (moldes_llenados * piezas_por_molde / piezas_por_paquete - paquetes) * m2_por_paquete
         ), 1)                                          as m2
  from estanterias.tandas t
  cross join lateral (
    select max(mv.creado_en) as empaquetada_en
    from estanterias.movimientos mv
    where mv.tanda_id = t.id and mv.tipo = 'empaquetado'
  ) e
  where t.paquetes is not null
    and ${enPeriodo(sql`e.empaquetada_en`, p)}
`;

export type FilaRotura = {
  clave: string | null;
  tandas: number;
  esperados: number;
  reales: number;
  pct: string | null;
  /** m2 rotos; null si ningun producto del grupo tiene m2 por paquete. */
  m2: string | null;
};

/** Rotura de todo el periodo: una sola fila, para el resumen. */
export async function roturaGeneral(p: Periodo): Promise<FilaRotura> {
  const r = await db.execute(sql`${roturaPor(sql`'Total'`, p)}`);
  return r.rows[0] as FilaRotura;
}

export async function roturaPorProducto(p: Periodo) {
  const r = await db.execute(sql`
    ${roturaPor(sql`producto_nombre`, p)}
    group by producto_nombre order by pct desc nulls last
  `);
  return r.rows as FilaRotura[];
}

export async function roturaPorTrompo(p: Periodo) {
  const r = await db.execute(sql`
    ${roturaPor(sql`upper(trompo::text)`, p)}
    group by upper(trompo::text) order by clave
  `);
  return r.rows as FilaRotura[];
}

/** Por desmoldador, igual que por maquinista. Lo de antes del registro, "sin dato". */
export async function roturaPorDesmoldador(p: Periodo) {
  const r = await db.execute(sql`
    ${roturaPor(sql`coalesce(desmoldador_nombre, 'Sin dato')`, p)}
    group by 1 order by pct desc nulls last
  `);
  return r.rows as FilaRotura[];
}

/** Por maquinista. Las tandas de antes de la lista quedan como "sin dato". */
export async function roturaPorMaquinista(p: Periodo) {
  const r = await db.execute(sql`
    ${roturaPor(sql`coalesce(maquinista_nombre, 'Sin dato')`, p)}
    group by 1 order by pct desc nulls last
  `);
  return r.rows as FilaRotura[];
}

/** Con horno contra sin horno: ¿el fraguado natural rompe mas? */
export async function roturaSegunHorno(p: Periodo) {
  const r = await db.execute(sql`
    ${roturaPor(
      sql`case when exists (
       select 1 from estanterias.movimientos mv
       where mv.tanda_id = t.id and mv.tipo = 'salida_horno')
       then 'Pasó por el horno' else 'Fraguado natural' end`,
      p,
    )}
    group by 1 order by 1
  `);
  return r.rows as FilaRotura[];
}

export async function roturaPorCemento(p: Periodo) {
  const r = await db.execute(sql`
    ${roturaPor(sql`'Cemento ' || cemento::text`, p)}
    group by 1 order by 1
  `);
  return r.rows as FilaRotura[];
}

export async function roturaPorArido(p: Periodo) {
  const r = await db.execute(sql`
    ${roturaPor(sql`case arido when 'alivianado' then 'Alivianado' else 'Hormigón' end`, p)}
    group by 1 order by 1
  `);
  return r.rows as FilaRotura[];
}

/**
 * Cuanto costo cada reasignacion de familia o cemento (ARQUITECTURA.md §10.6).
 *
 * Es la razon por la que las reasignaciones se registran con motivo: las primeras
 * tandas despues de un cambio salen manchadas aunque se laven los moldes, y ese
 * costo "medido y aceptado" solo existe si alguien lo mide.
 *
 * Toma las primeras N tandas ya contadas de esa estanteria despues del cambio y
 * las compara con la rotura habitual del mismo modelo, familia y cemento en otras
 * estanterias (ultimos 90 dias).
 */
export const TANDAS_DESPUES_DE_REASIGNAR = 5;

export async function costoDeReasignaciones() {
  const n = TANDAS_DESPUES_DE_REASIGNAR;
  const r = await db.execute(sql`
    with post as (
      select r.id as rid, t.*,
             row_number() over (partition by r.id order by t.creada_en) as orden
      from estanterias.reasignaciones r
      join estanterias.tandas t
        on t.estanteria_id = r.estanteria_id
       and t.creada_en >= r.creado_en
       and t.paquetes is not null
    ),
    agregado as (
      select rid,
             count(*)::int as tandas,
             sum(floor(moldes_llenados * piezas_por_molde / piezas_por_paquete))::int as esperados,
             sum(paquetes)::int as reales,
             sum((floor(moldes_llenados * piezas_por_molde / piezas_por_paquete) - paquetes)::numeric
                 * coalesce(m2_por_paquete, 0))::numeric as m2_perdidos
      from post where orden <= ${n}
      group by rid
    )
    select r.id, r.etiqueta_antes, r.etiqueta_despues, r.familia_antes, r.familia_despues,
           r.cemento_antes::text as cemento_antes, r.cemento_despues::text as cemento_despues,
           r.motivo, r.usuario_nombre, r.creado_en,
           coalesce(a.tandas, 0) as tandas, a.esperados, a.reales,
           round(a.m2_perdidos, 1) as m2_perdidos,
           round((100.0 * (a.esperados - a.reales) / nullif(a.esperados, 0))::numeric, 2) as pct,
           (
             -- floor() de un entero devuelve double precision, y round(x, 2) solo
             -- existe para numeric: sin el cast Postgres no encuentra la funcion.
             select round((100.0 * sum(floor(t.moldes_llenados * t.piezas_por_molde / t.piezas_por_paquete) - t.paquetes)
                    / nullif(sum(floor(t.moldes_llenados * t.piezas_por_molde / t.piezas_por_paquete)), 0))::numeric, 2)
             from estanterias.tandas t
             join estanterias.estanterias e on e.id = t.estanteria_id
             join estanterias.estanterias yo on yo.id = r.estanteria_id
             where t.paquetes is not null
               and t.estanteria_id <> r.estanteria_id
               and e.modelo_id = yo.modelo_id and e.familia_id = yo.familia_id
               and t.cemento = yo.cemento
               and t.creada_en >= now() - interval '90 days'
           ) as pct_habitual
    from estanterias.reasignaciones r
    left join agregado a on a.rid = r.id
    order by r.creado_en desc
  `);
  return r.rows as {
    id: number;
    etiqueta_antes: string;
    etiqueta_despues: string;
    familia_antes: string;
    familia_despues: string;
    cemento_antes: string;
    cemento_despues: string;
    motivo: string;
    usuario_nombre: string;
    creado_en: string;
    tandas: number;
    esperados: number | null;
    reales: number | null;
    m2_perdidos: string | null;
    pct: string | null;
    pct_habitual: string | null;
  }[];
}

/* -------------------------------------------------------------------------- */
/* Capacidad perdida y dosificacion                                           */
/* -------------------------------------------------------------------------- */

/**
 * m2 que se fraguaron afuera del horno, abiertos por motivo.
 *
 * `horno_lleno` es capacidad perdida -el numero con el que se justifica un
 * horno nuevo- y `clima` es ahorro de energia. Son opuestos: si se sumaran
 * juntos el resultado no serviria para decidir nada.
 */
export async function fraguadoNaturalPorMotivo(p: Periodo) {
  const r = await db.execute(sql`
    select mv.motivo_fraguado                          as motivo,
           sum(t.peso)::float8                         as tandas,
           round(sum(
             (t.moldes_llenados * t.piezas_por_molde / t.piezas_por_paquete)
             * coalesce(t.m2_por_paquete, 0)
           ), 1)                                       as m2
    from estanterias.movimientos mv
    join estanterias.tandas t on t.id = mv.tanda_id
    where mv.tipo = 'fraguado_natural'
      and ${enPeriodo(sql`mv.creado_en`, p)}
    group by mv.motivo_fraguado
    order by m2 desc nulls last
  `);
  return r.rows as { motivo: string | null; tandas: number; m2: string | null }[];
}

/**
 * Moldes que quedaron sin llenar, casi siempre porque no alcanzo la mezcla.
 *
 * El indicador que sirve es el PORCENTAJE, no los moldes sueltos: los sueltos
 * suben y bajan con la produccion del periodo, la relacion no.
 */
export async function moldesSinLlenar(p: Periodo) {
  const r = await db.execute(sql`
    select coalesce(sum(peso), 0)::float8                          as tandas,
           sum(coalesce(moldes_nominal, moldes_llenados))::int     as nominal,
           sum(moldes_llenados)::int                               as llenados,
           sum(coalesce(moldes_nominal, moldes_llenados) - moldes_llenados)::int as faltantes,
           round(
             100.0 * sum(coalesce(moldes_nominal, moldes_llenados) - moldes_llenados)
             / nullif(sum(coalesce(moldes_nominal, moldes_llenados)), 0)
           , 2)                                                    as pct,
           round(sum(
             (coalesce(moldes_nominal, moldes_llenados) - moldes_llenados)
             * piezas_por_molde / piezas_por_paquete
             * coalesce(m2_por_paquete, 0)
           ), 1)                                                   as m2
    from estanterias.tandas
    where ${enPeriodo(sql`creada_en`, p)}
  `);
  return r.rows[0] as {
    tandas: number;
    nominal: number;
    llenados: number;
    faltantes: number;
    pct: string | null;
    m2: string | null;
  };
}

/* -------------------------------------------------------------------------- */
/* Produccion                                                                 */
/* -------------------------------------------------------------------------- */

/** Lo empaquetado cada dia del periodo, por fecha de empaquetado (como la rotura). */
export async function produccionDiaria(p: Periodo) {
  const r = await db.execute(sql`
    select to_char((e.empaquetada_en at time zone ${TZ})::date, 'YYYY-MM-DD') as dia,
           sum(peso)::float8                               as tandas,
           sum(paquetes)::int                              as paquetes,
           -- Por unidad: sumar paquetes con unidades sueltas no dice nada.
           (sum(paquetes) filter (where unidad = 'paquete'))::int as en_paquetes,
           (sum(paquetes) filter (where unidad = 'unidad'))::int  as en_unidades,
           (sum(paquetes) filter (where unidad = 'nivel'))::int   as en_niveles,
           round(sum(paquetes * coalesce(m2_por_paquete, 0)), 1) as m2
    from estanterias.tandas t
    cross join lateral (
      select max(mv.creado_en) as empaquetada_en
      from estanterias.movimientos mv
      where mv.tanda_id = t.id and mv.tipo = 'empaquetado'
    ) e
    where t.paquetes is not null
      and ${enPeriodo(sql`e.empaquetada_en`, p)}
    group by 1 order by 1
  `);
  return r.rows as {
    dia: string;
    tandas: number;
    paquetes: number;
    en_paquetes: number | null;
    en_unidades: number | null;
    en_niveles: number | null;
    m2: string | null;
  }[];
}

export async function ocupacionHorno() {
  const r = await db.execute(sql`
    select count(*)::int as n from estanterias.tandas where estado = 'horno'
  `);
  return Number((r.rows[0] as { n: number }).n);
}

/* -------------------------------------------------------------------------- */
/* Lavados del trompo                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Lavados del trompo dia por dia: lo que cargo el operario contra el minimo
 * que hacia falta segun lo que se lleno de verdad.
 *
 * Los lavados cargados son los DE MAS (sin el de fin de jornada), un numero
 * por dia; null es "no se cargo", que no es lo mismo que cero.
 *
 * El minimo sale de las maquinadas llenadas ese dia (por fecha de llenado,
 * como Produccion): por trompo, sus grupos de color distintos menos uno. Es la
 * misma regla que los lavados previstos del programa (lib/lavados-previstos.ts),
 * pero con lo hecho y no con lo pedido. Usa el grupo que el producto tiene
 * hoy. Las maquinadas sin grupo no entran: se informan aparte.
 *
 * Sale un dia si se lleno algo o si se cargaron lavados.
 */
export async function lavadosPorDia(p: Periodo) {
  const r = await db.execute(sql`
    with llenado as (
      select (t.creada_en at time zone ${TZ})::date as dia,
             t.trompo,
             t.peso,
             pr.grupo_color_id
      from estanterias.tandas t
      join estanterias.productos pr on pr.id = t.producto_id
      where ${enPeriodo(sql`t.creada_en`, p)}
    ),
    por_trompo as (
      select dia, trompo, count(distinct grupo_color_id)::int as grupos
      from llenado
      group by dia, trompo
    ),
    minimo as (
      select dia, sum(greatest(grupos - 1, 0))::int as minimo
      from por_trompo
      group by dia
    ),
    dias as (
      select dia,
             sum(peso)::float8                                      as maquinadas,
             coalesce(sum(peso) filter (where grupo_color_id is null), 0)::float8 as sin_grupo,
             count(distinct trompo)::int                            as trompos
      from llenado
      group by dia
    ),
    cargados as (
      select dia, cantidad
      from estanterias.lavados_trompo
      where dia between ${p.desde}::date and ${p.hasta}::date
    )
    select to_char(coalesce(d.dia, c.dia), 'YYYY-MM-DD') as dia,
           c.cantidad                                     as cargados,
           coalesce(d.maquinadas, 0)                      as maquinadas,
           coalesce(d.sin_grupo, 0)                       as sin_grupo,
           coalesce(d.trompos, 0)                         as trompos,
           coalesce(m.minimo, 0)                          as minimo
    from dias d
    full join cargados c on c.dia = d.dia
    left join minimo m on m.dia = coalesce(d.dia, c.dia)
    order by 1
  `);
  return (
    r.rows as {
      dia: string;
      cargados: number | null;
      maquinadas: number;
      sin_grupo: number;
      trompos: number;
      minimo: number;
    }[]
  ).map((f) => ({
    ...f,
    cargados: f.cargados === null ? null : Number(f.cargados),
    maquinadas: Number(f.maquinadas),
    sin_grupo: Number(f.sin_grupo),
    trompos: Number(f.trompos),
    minimo: Number(f.minimo),
  }));
}

export type DiaLavados = Awaited<ReturnType<typeof lavadosPorDia>>[number];
