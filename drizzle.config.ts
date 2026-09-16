/**
 * NO USAR `drizzle-kit push` EN ESTE PROYECTO.
 *
 * Con Postgres 18 (el de Neon), esta version de drizzle-kit no reconoce las
 * restricciones NOT NULL con nombre y propone borrarlas de TODAS las tablas.
 * Ademas aplica sentencia por sentencia sin transaccion: la unica vez que se uso
 * despues de la migracion a Postgres 18 dejo la base a medias. Ver
 * ARQUITECTURA.md §9.5.
 *
 * Los cambios de esquema van como SQL en `migraciones/` y se aplican con
 * `npm run db:migrar`. Este archivo queda para `db:studio` y `db:generate`
 * (que genera SQL para leer, no lo aplica).
 */
import { config as cargarEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next lee .env.local automaticamente, pero drizzle-kit corre fuera de Next:
// hay que cargarlo a mano, con .env como respaldo.
cargarEnv({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Las migraciones van por la conexion directa, no por la pooled.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
  /**
   * LA LINEA MAS IMPORTANTE DE ESTE ARCHIVO.
   *
   * `drizzle-kit push` compara el archivo de esquema contra la base y propone
   * BORRAR todo lo que no reconoce. Sin este filtro, un push desde aca apuntado
   * por error a la base de Control-Secaderos se llevaria puestas todas sus
   * tablas, porque este schema.ts no las conoce.
   *
   * Con el filtro, push solo mira el esquema `estanterias`. `public` deja de
   * existir para el. No es una precaucion: es una imposibilidad.
   */
  schemaFilter: ["estanterias"],
});
