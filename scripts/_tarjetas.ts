/**
 * Logica de tarjetas compartida por los scripts: cargar las palabras desde el
 * JSON y repartir tarjetas a tandas historicas. La app no usa este modulo: en
 * runtime la tarjeta la asigna el motor al llenar.
 */
import { readFileSync } from "node:fs";
import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "./_db";
import { config, tandas, tarjetas } from "../lib/db/schema";
import {
  FABRICADAS_POR_DEFECTO,
  LETRAS,
  claveFabricadas,
  letraDelDia,
  type Letra,
} from "../lib/tarjetas";

type Json = { dias: { letra: Letra; palabras: string[] }[] };

/**
 * Carga o actualiza las tarjetas desde `datos/palabras.json`.
 *
 * Conservador, con las mismas reglas que el import de Excel:
 * - NUNCA borra una tarjeta. Si el JSON tiene menos palabras para una letra, las
 *   que sobran en la base quedan como estaban.
 * - Si cambia la palabra de una posicion y esa tarjeta esta EN USO (colgada en una
 *   tanda que no llego a `listo`), no la toca: la tarjeta fisica diria una cosa y
 *   el sistema otra. Se vuelve a correr cuando vuelva al gancho.
 * - Si una palabra cambia de lugar, se libera primero su posicion vieja para no
 *   chocar con el indice unico de palabra.
 */
export async function cargarPalabras() {
  const datos = JSON.parse(readFileSync("datos/palabras.json", "utf-8")) as Json;

  const enUso = new Set(
    (
      await db
        .select({ id: tandas.tarjetaId })
        .from(tandas)
        .where(and(isNotNull(tandas.tarjetaId), ne(tandas.estado, "listo")))
    ).map((f) => f.id),
  );

  let creadas = 0;
  let cambiadas = 0;
  const salteadas: string[] = [];

  for (const d of datos.dias) {
    const existentes = await db.select().from(tarjetas).where(eq(tarjetas.letra, d.letra));
    const porOrden = new Map(existentes.map((t) => [t.orden, t]));
    const nuevas: { letra: string; orden: number; palabra: string }[] = [];

    for (const [i, palabra] of d.palabras.entries()) {
      const orden = i + 1;
      const ya = porOrden.get(orden);
      if (ya && ya.palabra === palabra) continue;
      if (ya && enUso.has(ya.id)) {
        salteadas.push(`${d.letra}${orden} ${ya.palabra} -> ${palabra} (en uso)`);
        continue;
      }
      if (!ya && !existentes.some((e) => e.palabra === palabra)) {
        // Caso comun (carga inicial): se insertan todas juntas al final.
        nuevas.push({ letra: d.letra, orden, palabra });
        continue;
      }
      await db.transaction(async (tx) => {
        await tx
          .update(tarjetas)
          .set({ palabra: sql`${tarjetas.palabra} || '#' || ${tarjetas.id}` })
          .where(and(eq(tarjetas.palabra, palabra), ya ? ne(tarjetas.id, ya.id) : sql`true`));
        if (ya) {
          await tx.update(tarjetas).set({ palabra }).where(eq(tarjetas.id, ya.id));
          cambiadas++;
        } else {
          await tx.insert(tarjetas).values({ letra: d.letra, orden, palabra });
          creadas++;
        }
      });
    }
    if (nuevas.length) {
      await db.insert(tarjetas).values(nuevas);
      creadas += nuevas.length;
    }
  }

  for (const l of LETRAS) {
    await db
      .insert(config)
      .values({ clave: claveFabricadas(l), valor: String(FABRICADAS_POR_DEFECTO[l]) })
      .onConflictDoNothing();
  }

  return { creadas, cambiadas, salteadas };
}

/**
 * Reparte tarjetas a las tandas que no tienen, en orden cronologico, como si
 * las tarjetas hubieran existido desde el principio: cada tanda toma la primera
 * libre de su dia, y la tarjeta vuelve al gancho cuando la tanda llego a
 * `listo`. Solo para datos historicos o simulados.
 *
 * No hace nada si ya hay alguna tanda con tarjeta: mezclar un reparto simulado
 * con asignaciones reales dejaria tarjetas cruzadas.
 */
export async function repartirTarjetasHistoricas() {
  const ya = await db.execute(sql`select count(*)::int n from estanterias.tandas where tarjeta_id is not null`);
  if (Number((ya.rows[0] as { n: number }).n) > 0) return { asignadas: 0, sinTarjeta: 0, salteado: true };

  const todas = await db.select().from(tarjetas).orderBy(asc(tarjetas.letra), asc(tarjetas.orden));
  const cfg = await db.select().from(config);
  const fabricadas = (l: Letra) => {
    const v = cfg.find((c) => c.clave === claveFabricadas(l));
    return v ? Number(v.valor) : FABRICADAS_POR_DEFECTO[l];
  };

  const lista = await db.select().from(tandas).orderBy(asc(tandas.creadaEn), asc(tandas.id));
  const ocupadaHasta = new Map<number, Date | null>();
  const porTanda: { tandaId: number; tarjetaId: number; palabra: string; letra: string; orden: number }[] = [];
  let sinTarjeta = 0;

  for (const t of lista) {
    const letra = letraDelDia(t.creadaEn);
    const candidata = todas.find((c) => {
      if (c.letra !== letra || c.orden > fabricadas(letra) || !c.activa || c.perdidaDesde) return false;
      if (!ocupadaHasta.has(c.id)) return true;
      const hasta = ocupadaHasta.get(c.id);
      return hasta !== null && hasta !== undefined && hasta <= t.creadaEn;
    });
    if (!candidata) {
      sinTarjeta++;
      continue;
    }
    ocupadaHasta.set(candidata.id, t.estado === "listo" ? t.estadoDesde : null);
    porTanda.push({
      tandaId: t.id,
      tarjetaId: candidata.id,
      palabra: candidata.palabra,
      letra: candidata.letra,
      orden: candidata.orden,
    });
  }

  // En lotes y en SQL: con cientos de tandas, una consulta por fila corta la
  // conexion a mitad de camino.
  for (let i = 0; i < porTanda.length; i += 200) {
    const lote = porTanda.slice(i, i + 200);
    const valores = sql.join(
      lote.map((x) => sql`(${x.tandaId}::int, ${x.tarjetaId}::int, ${x.palabra}, ${x.letra}, ${x.orden}::int)`),
      sql`, `,
    );
    await db.execute(sql`
      update estanterias.tandas t
      set tarjeta_id = v.tarjeta_id, tarjeta_palabra = v.palabra, tarjeta_letra = v.letra, tarjeta_orden = v.orden
      from (values ${valores}) as v(tanda_id, tarjeta_id, palabra, letra, orden)
      where t.id = v.tanda_id`);
    await db.execute(sql`
      update estanterias.movimientos m
      set tanda_palabra = v.palabra
      from (values ${valores}) as v(tanda_id, tarjeta_id, palabra, letra, orden)
      where m.tanda_id = v.tanda_id`);
  }

  return { asignadas: porTanda.length, sinTarjeta, salteado: false };
}
