import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";

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
 *    producto, trompo, responsable del llenado y desmoldador.
 *
 * 3. Los m2 se suman en SQL con `numeric`. Pasarlos por float antes de sumar
 *    es exactamente lo que se quiso evitar al elegir el tipo de la columna.
 */

export const RANGOS = [7, 30, 90, 365] as const;
export type Rango = (typeof RANGOS)[number];

const desdeSql = (dias: number) => sql`now() - ${`${dias} days`}::interval`;

/* -------------------------------------------------------------------------- */

export async function tiemposPorEtapa(dias: Rango) {
  const r = await db.execute(sql`
    select tipo,
           count(*)::int                                as n,
           round(avg(duracion_min)::numeric / 60, 1)    as prom,
           round(min(duracion_min)::numeric / 60, 1)    as minimo,
           round(max(duracion_min)::numeric / 60, 1)    as maximo,
           round((percentile_cont(0.5) within group (order by duracion_min))::numeric / 60, 1) as mediana
    from estanterias.movimientos
    where duracion_min is not null
      and creado_en >= ${desdeSql(dias)}
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
export async function tiempoDeHorno(dias: Rango) {
  const r = await db.execute(sql`
    select producto_nombre                              as producto,
           count(*)::int                                as ciclos,
           round(avg(duracion_min)::numeric / 60, 1)    as prom,
           round(min(duracion_min)::numeric / 60, 1)    as minimo,
           round(max(duracion_min)::numeric / 60, 1)    as maximo
    from estanterias.movimientos
    where tipo = 'salida_horno'
      and duracion_min is not null
      and creado_en >= ${desdeSql(dias)}
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
export async function efectoDeLaDevolucion(dias: Rango) {
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
        and m.creado_en >= ${desdeSql(dias)}
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

const roturaPor = (campo: ReturnType<typeof sql>) => sql`
  select ${campo}                                       as clave,
         count(*)::int                                  as tandas,
         -- Sin floor(): en Postgres la division entre enteros ya trunca, y
         -- floor() devuelve double precision, que despues rompe round(x, 2)
         -- porque no existe round(double precision, integer).
         sum(moldes_llenados * piezas_por_molde / piezas_por_paquete)::int as esperados,
         sum(paquetes)::int                             as reales,
         round(
           100.0 * (sum(moldes_llenados * piezas_por_molde / piezas_por_paquete) - sum(paquetes))
           / nullif(sum(moldes_llenados * piezas_por_molde / piezas_por_paquete), 0)
         , 2)                                           as pct
  from estanterias.tandas t
  where paquetes is not null
`;

type FilaRotura = {
  clave: string | null;
  tandas: number;
  esperados: number;
  reales: number;
  pct: string | null;
};

export async function roturaPorProducto(dias: Rango) {
  const r = await db.execute(sql`
    ${roturaPor(sql`producto_nombre`)}
      and estado_desde >= ${desdeSql(dias)}
    group by producto_nombre order by pct desc nulls last
  `);
  return r.rows as FilaRotura[];
}

export async function roturaPorTrompo(dias: Rango) {
  const r = await db.execute(sql`
    ${roturaPor(sql`upper(trompo::text)`)}
      and estado_desde >= ${desdeSql(dias)}
    group by upper(trompo::text) order by clave
  `);
  return r.rows as FilaRotura[];
}

/** Por quien lleno el trompo, y por quien desmoldo. Nunca por quien empaco. */
export async function roturaPorResponsable(dias: Rango, tipo: "llenado" | "desmolde") {
  const r = await db.execute(sql`
    ${roturaPor(sql`(
      select mv.usuario_nombre from estanterias.movimientos mv
      where mv.tanda_id = t.id and mv.tipo = ${tipo}::estanterias.tipo_movimiento
      order by mv.creado_en limit 1)`)}
      and estado_desde >= ${desdeSql(dias)}
    group by 1 order by pct desc nulls last
  `);
  return r.rows as FilaRotura[];
}

/** Con horno contra sin horno: ¿el fraguado natural rompe mas? */
export async function roturaSegunHorno(dias: Rango) {
  const r = await db.execute(sql`
    ${roturaPor(sql`case when exists (
       select 1 from estanterias.movimientos mv
       where mv.tanda_id = t.id and mv.tipo = 'salida_horno')
       then 'Pasó por el horno' else 'Fraguado natural' end`)}
      and estado_desde >= ${desdeSql(dias)}
    group by 1 order by 1
  `);
  return r.rows as FilaRotura[];
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
export async function fraguadoNaturalPorMotivo(dias: Rango) {
  const r = await db.execute(sql`
    select mv.motivo_fraguado                          as motivo,
           count(*)::int                               as tandas,
           round(sum(
             (t.moldes_llenados * t.piezas_por_molde / t.piezas_por_paquete)
             * coalesce(t.m2_por_paquete, 0)
           ), 1)                                       as m2
    from estanterias.movimientos mv
    join estanterias.tandas t on t.id = mv.tanda_id
    where mv.tipo = 'fraguado_natural'
      and mv.creado_en >= ${desdeSql(dias)}
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
export async function moldesSinLlenar(dias: Rango) {
  const r = await db.execute(sql`
    select count(*)::int                                          as tandas,
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
    where creada_en >= ${desdeSql(dias)}
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

export async function produccionDiaria(dias: Rango) {
  const r = await db.execute(sql`
    select to_char(date_trunc('day', estado_desde at time zone 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') as dia,
           count(*)::int                                   as tandas,
           sum(paquetes)::int                              as paquetes,
           round(sum(paquetes * coalesce(m2_por_paquete, 0)), 1) as m2
    from estanterias.tandas
    where estado = 'listo'
      and paquetes is not null
      and estado_desde >= ${desdeSql(dias)}
    group by 1 order by 1
  `);
  return r.rows as {
    dia: string;
    tandas: number;
    paquetes: number;
    m2: string | null;
  }[];
}

export async function ocupacionHorno() {
  const r = await db.execute(sql`
    select count(*)::int as n from estanterias.tandas where estado = 'horno'
  `);
  return Number((r.rows[0] as { n: number }).n);
}
