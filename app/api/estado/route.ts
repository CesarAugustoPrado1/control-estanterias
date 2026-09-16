import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Diagnóstico de despliegue. NO pide sesión a propósito: el caso que viene a
 * resolver es justamente "no puedo entrar", así que exigir login lo haría
 * inútil.
 *
 * Por eso devuelve SOLO booleanos y conteos. Nunca el valor de una variable,
 * nunca el host de la base, nunca un fragmento de la cadena de conexión: saber
 * que SESSION_SECRET está cargada no le sirve a nadie para nada, y saber cuánto
 * mide o cómo empieza, sí.
 *
 * Abrir /api/estado convierte "hubo un problema al guardar" en una respuesta
 * concreta sin tener que buscar en los logs.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const variables = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    DIRECT_URL: Boolean(process.env.DIRECT_URL),
    SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
  };

  // Que la cadena apunte al pooler es un problema de rendimiento, no de
  // arranque: conviene avisarlo sin que parezca un error.
  const usaPooler = (process.env.DATABASE_URL ?? "").includes("-pooler");

  let base:
    | { ok: true; tandas: number; usuarios: number; ms: number }
    | { ok: false; error: string };

  const t0 = Date.now();
  try {
    const r = await db.execute(sql`
      select (select count(*) from estanterias.tandas)::int   as tandas,
             (select count(*) from estanterias.usuarios)::int as usuarios
    `);
    const fila = r.rows[0] as { tandas: number; usuarios: number };
    base = {
      ok: true,
      tandas: Number(fila.tandas),
      usuarios: Number(fila.usuarios),
      ms: Date.now() - t0,
    };
  } catch (e) {
    // El mensaje del driver no lleva credenciales: dice qué falló, no con qué.
    base = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const listo = variables.DATABASE_URL && variables.SESSION_SECRET && base.ok;

  return Response.json(
    {
      listo,
      variables,
      usaPooler,
      base,
      region: process.env.VERCEL_REGION ?? "local",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      queHacer: listo
        ? "Todo en orden. Si igual no podés entrar, el problema es el usuario o el PIN."
        : !variables.SESSION_SECRET
          ? "Falta SESSION_SECRET en Vercel. Cargala y hacé Redeploy: las variables nuevas no se aplican al deploy que ya estaba hecho."
          : !variables.DATABASE_URL
            ? "Falta DATABASE_URL en Vercel. Cargala y hacé Redeploy."
            : "Las variables están, pero la base no responde. Mirá el campo base.error.",
    },
    { status: listo ? 200 : 503 },
  );
}
