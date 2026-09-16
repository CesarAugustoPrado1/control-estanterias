import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "./schema";
import { ErrorDeConfiguracion } from "../errores";

type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Por que el driver de Neon y no `postgres-js` como en Control-Secaderos.
 *
 * En Secaderos el driver hace pipelining y eso obliga a usar el pooler de
 * Supabase en modo SESION, donde cada conexion ocupa un lugar del pool mientras
 * viva. En serverless cada instancia de Vercel abre la suya, asi que el pool se
 * convierte en el techo de instancias concurrentes: pasado ese numero, toda
 * pantalla que consulte la base devuelve 500. Esta documentado en el
 * ARQUITECTURA.md de esa app y costo caro diagnosticarlo.
 *
 * El driver de Neon esta hecho para serverless y no tiene ese techo. Usamos la
 * variante WebSocket (`neon-serverless`) y NO la HTTP (`neon-http`), aunque la
 * HTTP sea mas rapida: la HTTP no soporta transacciones interactivas, y todo el
 * motor de movimientos corre dentro de una transaccion que empieza con
 * `SELECT ... FOR UPDATE` para que dos operarios no muevan la misma tanda.
 */
neonConfig.webSocketConstructor = ws;

/**
 * En desarrollo el hot reload vuelve a evaluar el modulo, asi que ademas del
 * cache de modulo guardamos el cliente en globalThis para no ir dejando pools
 * colgados en cada recarga.
 */
const global_ = globalThis as unknown as {
  neonPool?: Pool;
  drizzleDb?: Db;
};

/**
 * Cache de modulo: evita levantar un pool nuevo en cada acceso a `db`.
 */
let cache: Db | undefined;

function conectar(): Db {
  if (cache) return cache;
  if (global_.drizzleDb) return (cache = global_.drizzleDb);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new ErrorDeConfiguracion(
      "Falta la variable DATABASE_URL. En local: copiá .env.example a .env.local " +
        "y completala con la cadena POOLED de Neon (la que tiene '-pooler' en el " +
        "host). En Vercel: cargala en Settings > Environment Variables marcando " +
        "Production, y volvé a desplegar, porque las variables nuevas no se " +
        "aplican al deploy que ya estaba hecho.",
    );
  }

  // Los scripts de linea de comandos pisan DATABASE_URL con DIRECT_URL a
  // proposito (ver scripts/_db.ts): ahi el aviso sobra.
  const directaAdrede = connectionString === process.env.DIRECT_URL;
  if (!connectionString.includes("-pooler") && !directaAdrede) {
    // No es un error fatal -anda igual-, pero conviene enterarse: la cadena
    // directa en runtime desperdicia el pooler y se nota con varias instancias.
    console.warn(
      "[db] DATABASE_URL no parece ser la cadena pooled de Neon. " +
        "Para runtime usá la que tiene '-pooler' en el host; la directa dejala " +
        "en DIRECT_URL, que es la que usa drizzle-kit.",
    );
  }

  const pool = global_.neonPool ?? new Pool({ connectionString });

  cache = drizzle(pool, { schema });

  if (process.env.NODE_ENV !== "production") {
    global_.neonPool = pool;
    global_.drizzleDb = cache;
  }
  return cache;
}

/**
 * La conexion se abre en el primer uso, no al importar el modulo: asi
 * `next build` puede recorrer las rutas sin necesitar la base configurada.
 */
export const db = new Proxy({} as Db, {
  get: (_, prop: keyof Db) => conectar()[prop],
});

export { schema };
