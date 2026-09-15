/**
 * Cliente de base para los scripts de linea de comandos.
 *
 * Diferencia con el de la app: los scripts usan la conexion DIRECTA, no la
 * pooled. Un script hace muchas consultas seguidas durante varios segundos, y
 * sobre el pooler eso termina en `Connection terminated unexpectedly` a mitad
 * de camino. La app hace lo contrario -consultas cortas desde muchas instancias
 * efimeras- y ahi el pooler es justo lo que hace falta.
 *
 * Funciona porque `lib/db` es lazy: lee `DATABASE_URL` en el primer uso, no al
 * importarse, asi que pisarla aca llega a tiempo.
 */
import { config as cargarEnv } from "dotenv";

cargarEnv({ path: [".env.local", ".env"], quiet: true });

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

export { db } from "../lib/db";

import { sql } from "drizzle-orm";
import { db as cliente } from "../lib/db";

/**
 * Espera a que el compute de Neon este despierto antes de arrancar.
 *
 * Neon apaga el compute a los 5 minutos sin uso. Al volver, la primera consulta
 * a veces NO espera el arranque: falla con `Connection terminated unexpectedly`
 * o `ECONNRESET`. Es un fallo de conexion, no de la consulta, asi que reintentar
 * es correcto -no se puede haber aplicado nada a medias-.
 *
 * Ojo con la distincion, que es la misma que en la app: se reintentan los fallos
 * de RED. Un error de SQL no se reintenta nunca, porque daria siempre lo mismo.
 */
export async function despertar(intentos = 5): Promise<void> {
  for (let i = 1; i <= intentos; i++) {
    try {
      await cliente.execute(sql`select 1`);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const esRed =
        /terminated|ECONNRESET|socket|timeout|fetch failed|closed/i.test(msg);
      if (!esRed || i === intentos) throw e;
      const espera = 800 * i;
      console.log(`  (base dormida, reintento ${i}/${intentos - 1}...)`);
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}
