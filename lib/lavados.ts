import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "./db";
import { lavadosTrompo } from "./db/schema";
import type { Periodo } from "./periodo";

/**
 * Lavados del trompo de un dia, sin contar el de fin de jornada.
 * Null: nadie lo cargo todavia (no es lo mismo que cero).
 */
export async function lavadosDelDia(dia: string): Promise<{ cantidad: number; por: string | null } | null> {
  const [l] = await db.select().from(lavadosTrompo).where(eq(lavadosTrompo.dia, dia));
  return l ? { cantidad: l.cantidad, por: l.cargadoPor } : null;
}

/** Total del periodo y en cuantos dias se cargo. */
export async function lavadosDelPeriodo({ desde, hasta }: Periodo): Promise<{ total: number; dias: number }> {
  const filas = await db
    .select({ cantidad: lavadosTrompo.cantidad })
    .from(lavadosTrompo)
    .where(and(gte(lavadosTrompo.dia, desde), lte(lavadosTrompo.dia, hasta)));
  return { total: filas.reduce((a, f) => a + f.cantidad, 0), dias: filas.length };
}
