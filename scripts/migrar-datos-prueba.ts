/**
 * Adapta los DATOS DE PRUEBA al modelo con cemento, placas y tarjetas.
 *
 *   npx tsx scripts/migrar-datos-prueba.ts
 *
 * Solo para la base de prueba. Cuando se carguen las planillas reales, esto no
 * se corre: los datos reales ya entran con cemento y numero, y las tarjetas se
 * asignan solas al llenar.
 *
 * No borra nada, a proposito: en la base hay tandas cargadas a mano durante la
 * validacion del circuito, y se conservan. Hace cuatro cosas, cada una se saltea
 * si ya esta hecha:
 *
 * 1. Familias: saca el cemento del nombre ("Beige — cemento blanco" -> "Beige").
 *    "Rojo" pasa a "Terracota", que es una familia real de planta.
 * 2. Cemento: los productos y estanterias que venian de una familia "cemento
 *    blanco" pasan a cemento blanco. Uhma Beige se parte, para poder probar la
 *    regla central: Uhma Beige Arena en gris, Uhma Beige Trigo en blanco. Cada
 *    estanteria de Uhma beige toma el cemento de la ultima tanda que tuvo, asi
 *    las tandas abiertas quedan coherentes con su estanteria.
 * 3. Snapshots de tandas: cemento y etiqueta de placa.
 * 4. Tarjetas: se reparten en orden cronologico como si hubieran existido desde
 *    el principio: cada tanda toma la primera libre de su dia, y la tarjeta
 *    vuelve al gancho cuando la tanda llego a `listo`.
 */
import { asc, eq, sql } from "drizzle-orm";
import { db, despertar } from "./_db";
import { config, familias, tandas, tarjetas } from "../lib/db/schema";
import {
  FABRICADAS_POR_DEFECTO,
  claveFabricadas,
  letraDelDia,
  type Letra,
} from "../lib/tarjetas";

const RENOMBRES: Record<string, string> = {
  "Gris — cemento gris": "Gris",
  "Negro — cemento gris": "Negro",
  "Rojo — cemento gris": "Terracota",
  "Beige — cemento blanco": "Beige",
};

async function main() {
  await despertar();

  // 1. Familias -------------------------------------------------------------
  const eraBlanco: number[] = [];
  for (const [viejo, nuevo] of Object.entries(RENOMBRES)) {
    const [f] = await db.select().from(familias).where(eq(familias.nombre, viejo));
    if (!f) continue;
    if (viejo.includes("blanco")) eraBlanco.push(f.id);
    await db.update(familias).set({ nombre: nuevo }).where(eq(familias.id, f.id));
    console.log(`Familia: "${viejo}" -> "${nuevo}"`);
  }

  // 2. Cemento ----------------------------------------------------------------
  if (eraBlanco.length) {
    const ids = sql.join(eraBlanco.map((i) => sql`${i}`), sql`, `);
    await db.execute(sql`
      update estanterias.productos set cemento = 'blanco' where familia_id in (${ids})`);
    await db.execute(sql`
      update estanterias.productos set cemento = 'gris' where nombre = 'Uhma Beige Arena'`);
    await db.execute(sql`
      update estanterias.estanterias set cemento = 'blanco' where familia_id in (${ids})`);
    // Uhma beige: cada estanteria toma el cemento del producto de su ultima tanda.
    const r = await db.execute(sql`
      update estanterias.estanterias e
      set cemento = coalesce((
        select pr.cemento from estanterias.tandas t
        join estanterias.productos pr on pr.id = t.producto_id
        where t.estanteria_id = e.id
        order by t.creada_en desc limit 1
      ), e.cemento)
      where e.modelo_id in (select id from estanterias.modelos where nombre = 'Uhma')
        and e.familia_id in (${ids})`);
    console.log(`Cemento: productos y estanterias de las familias blancas actualizados (${r.rowCount ?? "?"} de Uhma por su ultima tanda)`);
  }

  // 3. Snapshots ----------------------------------------------------------------
  const snap = await db.execute(sql`
    update estanterias.tandas t
    set cemento = p.cemento,
        estanteria_etiqueta = upper(m.nombre) || ' · ' || upper(f.nombre) || ' · ' || lpad(e.numero::text, 2, '0')
    from estanterias.productos p, estanterias.estanterias e, estanterias.modelos m, estanterias.familias f
    where p.id = t.producto_id and e.id = t.estanteria_id and m.id = e.modelo_id and f.id = e.familia_id
      and (t.estanteria_etiqueta is null or t.cemento <> p.cemento)`);
  // Mismo formato que etiquetaPlaca() en lib/tarjetas.ts: "UHMA · BEIGE · 03".
  console.log(`Snapshots de tandas actualizados: ${snap.rowCount ?? "?"}`);

  // 4. Tarjetas -----------------------------------------------------------------
  const ya = await db.execute(sql`select count(*)::int n from estanterias.tandas where tarjeta_id is not null`);
  if (Number((ya.rows[0] as { n: number }).n) > 0) {
    console.log("Tarjetas: ya hay tandas con tarjeta, no se reparten de nuevo.");
    return;
  }
  const todas = await db.select().from(tarjetas).orderBy(asc(tarjetas.letra), asc(tarjetas.orden));
  if (!todas.length) {
    console.log("Tarjetas: la tabla esta vacia. Correr antes `npm run db:palabras`.");
    return;
  }
  const cfg = await db.select().from(config);
  const fabricadas = (l: Letra) => {
    const v = cfg.find((c) => c.clave === claveFabricadas(l));
    return v ? Number(v.valor) : FABRICADAS_POR_DEFECTO[l];
  };

  const lista = await db.select().from(tandas).orderBy(asc(tandas.creadaEn), asc(tandas.id));
  // tarjetaId -> momento en que vuelve al gancho (null = sigue colgada)
  const ocupadaHasta = new Map<number, Date | null>();
  let asignadas = 0;
  let sinTarjeta = 0;

  for (const t of lista) {
    const letra = letraDelDia(t.creadaEn);
    const candidata = todas.find((c) => {
      if (c.letra !== letra || c.orden > fabricadas(letra) || !c.activa) return false;
      if (!ocupadaHasta.has(c.id)) return true;
      const hasta = ocupadaHasta.get(c.id);
      return hasta !== null && hasta !== undefined && hasta <= t.creadaEn;
    });
    if (!candidata) {
      sinTarjeta++;
      continue;
    }
    ocupadaHasta.set(candidata.id, t.estado === "listo" ? t.estadoDesde : null);
    await db
      .update(tandas)
      .set({
        tarjetaId: candidata.id,
        tarjetaPalabra: candidata.palabra,
        tarjetaLetra: candidata.letra,
        tarjetaOrden: candidata.orden,
      })
      .where(eq(tandas.id, t.id));
    await db.execute(sql`
      update estanterias.movimientos set tanda_palabra = ${candidata.palabra} where tanda_id = ${t.id}`);
    asignadas++;
  }
  console.log(`Tarjetas: ${asignadas} tandas con palabra, ${sinTarjeta} sin tarjeta libre en su dia.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
