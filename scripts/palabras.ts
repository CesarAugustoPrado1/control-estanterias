/**
 * Carga o actualiza las tarjetas desde `datos/palabras.json`.
 *
 *   npm run db:palabras
 *
 * Idempotente y conservador, con las mismas reglas que el import de Excel:
 * - NUNCA borra una tarjeta. Si el JSON tiene menos palabras para una letra, las
 *   que sobran en la base quedan como estaban.
 * - Si cambia la palabra de una posicion y esa tarjeta esta EN USO (colgada en una
 *   tanda que no llego a `listo`), no la toca y avisa: cambiarla haria que la
 *   tarjeta fisica diga una cosa y el sistema otra. Se vuelve a correr cuando
 *   vuelva al gancho.
 * - Si una palabra cambia de lugar, se libera primero su posicion vieja para no
 *   chocar con el indice unico de palabra.
 *
 * Ademas deja `tarjetas_fabricadas_X` en `config` si no existe.
 */
import { readFileSync } from "node:fs";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db, despertar } from "./_db";
import { config, tandas, tarjetas } from "../lib/db/schema";
import { FABRICADAS_POR_DEFECTO, LETRAS, claveFabricadas, type Letra } from "../lib/tarjetas";

type Json = { dias: { letra: Letra; palabras: string[] }[] };

async function main() {
  await despertar();
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

    for (const [i, palabra] of d.palabras.entries()) {
      const orden = i + 1;
      const ya = porOrden.get(orden);
      if (ya && ya.palabra === palabra) continue;

      if (ya && enUso.has(ya.id)) {
        salteadas.push(`${d.letra}${orden} ${ya.palabra} -> ${palabra} (en uso)`);
        continue;
      }

      await db.transaction(async (tx) => {
        // Si la palabra ya existe en otra posicion libre, se le cambia el texto
        // provisoriamente para no violar el indice unico.
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
  }

  for (const l of LETRAS) {
    await db
      .insert(config)
      .values({ clave: claveFabricadas(l), valor: String(FABRICADAS_POR_DEFECTO[l]) })
      .onConflictDoNothing();
  }

  const huerfanas = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tarjetas)
    .where(sql`${tarjetas.palabra} like '%#%'`);

  console.log(`\nTarjetas: ${creadas} creadas, ${cambiadas} con palabra actualizada.`);
  if (salteadas.length) {
    console.log(`\nNo se tocaron por estar en uso (volver a correr cuando vuelvan al gancho):`);
    for (const s of salteadas) console.log("  " + s);
  }
  if (Number(huerfanas[0].n)) {
    console.log(
      `\nOjo: ${huerfanas[0].n} tarjeta(s) quedaron con una palabra provisoria (con '#'), porque su ` +
        `palabra paso a otra posicion que estaba en uso. Se resuelve solo en la proxima corrida.`,
    );
  }
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
