/**
 * Aplica las migraciones SQL de `migraciones/` que todavia no se aplicaron.
 *
 *   npm run db:migrar                          aplica las pendientes
 *   npm run db:migrar -- --ver                 solo muestra cuales estan pendientes
 *   npm run db:migrar -- --marcar ARCHIVO.sql  la registra como aplicada SIN correrla
 *
 * `--marcar` es para una sola situacion: una base que ya tiene lo que hace esa
 * migracion porque se creo por otro camino (la de prueba, creada con `push`
 * antes de que existieran estas migraciones). Marcar algo que NO esta aplicado
 * deja la base sin esas tablas y sin que nadie se entere.
 *
 * Por que SQL explicito y no `drizzle-kit push` (ARQUITECTURA.md §9.5): con
 * Postgres 18, drizzle-kit no reconoce las restricciones NOT NULL con nombre que
 * crea esa version y propone BORRARLAS de todas las tablas. Ademas aplica
 * sentencia por sentencia sin transaccion, asi que un fallo deja la base a
 * medias. Paso las dos cosas.
 *
 * Cada migracion corre entera dentro de una transaccion y queda registrada en
 * `estanterias.migraciones`. Los archivos se aplican en orden alfabetico, por
 * eso llevan numero adelante.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db, despertar } from "./_db";

const CARPETA = "migraciones";

async function main() {
  const soloVer = process.argv.includes("--ver");
  const iMarcar = process.argv.indexOf("--marcar");
  const aMarcar = iMarcar >= 0 ? process.argv[iMarcar + 1] : null;
  const host = (process.env.DATABASE_URL ?? "").split("@")[1]?.split("/")[0];
  console.log(`\nBase: ${host ?? "(sin DATABASE_URL)"}\n`);

  await despertar();

  // Sobre una base nueva el esquema todavia no existe: la tabla de control
  // tiene que poder crearse antes de la primera migracion.
  await db.execute(sql`create schema if not exists estanterias`);
  await db.execute(sql`
    create table if not exists estanterias.migraciones (
      nombre      text primary key,
      aplicada_en timestamptz not null default now()
    )`);

  const aplicadas = new Set(
    ((await db.execute(sql`select nombre from estanterias.migraciones`)).rows as { nombre: string }[]).map(
      (f) => f.nombre,
    ),
  );

  const archivos = readdirSync(CARPETA)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (aMarcar) {
    if (!archivos.includes(aMarcar)) throw new Error(`No existe migraciones/${aMarcar}`);
    await db.execute(sql`insert into estanterias.migraciones (nombre) values (${aMarcar}) on conflict do nothing`);
    aplicadas.add(aMarcar);
    console.log(`Marcada como aplicada (sin correrla): ${aMarcar}
`);
  }

  const pendientes = archivos.filter((f) => !aplicadas.has(f));

  for (const f of archivos) {
    console.log(`  ${aplicadas.has(f) ? "aplicada " : "PENDIENTE"}  ${f}`);
  }
  console.log();

  if (!pendientes.length) {
    console.log("No hay migraciones pendientes.\n");
    return;
  }
  if (soloVer) return;

  for (const f of pendientes) {
    const contenido = readFileSync(join(CARPETA, f), "utf-8");
    process.stdout.write(`Aplicando ${f}... `);
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(contenido));
      await tx.execute(sql`insert into estanterias.migraciones (nombre) values (${f})`);
    });
    console.log("ok");
  }
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nFALLO. La migracion que fallo no quedo aplicada (corre en transaccion).");
    console.error(e);
    process.exit(1);
  });
