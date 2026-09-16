/**
 * Carga o actualiza las tarjetas desde `datos/palabras.json`.
 *
 *   npm run db:palabras
 *
 * Nunca borra y no toca tarjetas en uso. Las reglas estan en `_tarjetas.ts`.
 */
import { sql } from "drizzle-orm";
import { db, despertar } from "./_db";
import { tarjetas } from "../lib/db/schema";
import { cargarPalabras } from "./_tarjetas";

async function main() {
  await despertar();
  const { creadas, cambiadas, salteadas } = await cargarPalabras();

  console.log(`\nTarjetas: ${creadas} creadas, ${cambiadas} con palabra actualizada.`);
  if (salteadas.length) {
    console.log(`\nNo se tocaron por estar en uso (volver a correr cuando vuelvan al gancho):`);
    for (const s of salteadas) console.log("  " + s);
  }
  const huerfanas = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tarjetas)
    .where(sql`${tarjetas.palabra} like '%#%'`);
  if (Number(huerfanas[0].n)) {
    console.log(
      `\nOjo: ${huerfanas[0].n} tarjeta(s) quedaron con una palabra provisoria (con '#'), porque su ` +
        `palabra paso a otra posicion que estaba en uso. Se resuelve sola en la proxima corrida.`,
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
