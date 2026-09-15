/**
 * Inspeccion y borrado de datos.
 *
 * Sin flags NO TOCA NADA: solo muestra que hay en cada tabla. Para borrar hay
 * que pedirlo explicitamente, y el script imprime contra que host esta
 * apuntando antes de hacerlo -que es la unica proteccion real contra correrlo
 * con el DATABASE_URL equivocado-.
 *
 * Usa TRUNCATE ... RESTART IDENTITY y no DELETE, a proposito. Un DELETE deja
 * las secuencias donde estaban, asi que despues de "borrar todo" la primera
 * tanda nueva saldria numerada 848. Arrancar de cero tiene que ser de cero
 * tambien en los numeros: el codigo de tanda es lo que se escribe en la tarjeta
 * y lo que se cita en un reclamo.
 *
 *   npm run db:limpiar                              solo muestra
 *   npm run db:limpiar -- --movimientos             borra tandas e historial
 *   npm run db:limpiar -- --todo                    borra tambien los maestros
 *   npm run db:limpiar -- --todo --conservar-usuarios
 */



import { sql } from "drizzle-orm";
import { db, despertar } from "./_db";

const ESQ = "estanterias";

/** Orden de dependencias: lo que referencia va antes de lo referenciado. */
const TABLAS = [
  "movimientos",
  "tandas",
  "estanterias",
  "productos",
  "modelos",
  "familias",
  "motivos_rotura",
  "usuarios",
  "config",
] as const;

const MOVIMIENTOS = ["movimientos", "tandas"] as const;

async function contar(tabla: string): Promise<number> {
  const r = await db.execute(
    sql.raw(`select count(*)::int as n from "${ESQ}"."${tabla}"`),
  );
  return Number((r.rows[0] as { n: number }).n);
}

async function main() {
  await despertar();
  const args = process.argv.slice(2);
  const soloMovimientos = args.includes("--movimientos");
  const todo = args.includes("--todo");
  const conservarUsuarios = args.includes("--conservar-usuarios");

  const host = (process.env.DATABASE_URL ?? "").split("@")[1]?.split("/")[0];
  console.log(`\nBase: ${host ?? "(sin DATABASE_URL)"}`);
  console.log(`Esquema: ${ESQ}\n`);

  const conteos: Record<string, number> = {};
  for (const t of TABLAS) conteos[t] = await contar(t);

  const ancho = Math.max(...TABLAS.map((t) => t.length));
  for (const t of TABLAS) {
    console.log(`  ${t.padEnd(ancho)}  ${String(conteos[t]).padStart(7)}`);
  }
  console.log();

  if (!soloMovimientos && !todo) {
    console.log("No se borro nada. Para borrar:");
    console.log("  --movimientos               tandas e historial");
    console.log("  --todo                      ademas los maestros");
    console.log("  --todo --conservar-usuarios igual, sin tocar usuarios\n");
    return;
  }

  let objetivo: string[] = todo ? [...TABLAS] : [...MOVIMIENTOS];
  if (todo && conservarUsuarios) {
    objetivo = objetivo.filter((t) => t !== "usuarios");
  }

  const total = objetivo.reduce((a, t) => a + conteos[t], 0);
  if (total === 0) {
    console.log("No hay nada para borrar en esas tablas.\n");
    return;
  }

  console.log(`Borrando ${total} filas de: ${objetivo.join(", ")}`);

  const lista = objetivo.map((t) => `"${ESQ}"."${t}"`).join(", ");
  // CASCADE es necesario porque las FK cruzan tablas del listado; RESTART
  // IDENTITY es el punto entero del script.
  await db.execute(sql.raw(`truncate table ${lista} restart identity cascade`));

  console.log("Listo. Secuencias reiniciadas en 1.\n");

  if (todo && !conservarUsuarios) {
    console.log("Ojo: borraste los usuarios. Corre `npm run db:seed` para");
    console.log("volver a crear el admin, o no vas a poder entrar.\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
