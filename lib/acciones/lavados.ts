"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autorizar } from "../auth";
import { db } from "../db";
import { lavadosTrompo } from "../db/schema";
import { FORMATO_DIA, hoy, sumarDias } from "../periodo";
import { ejecutar, fallar, type Resultado } from "./comun";

/**
 * Cuantas veces se lavo el trompo en el dia, ademas del lavado de fin de
 * jornada. Se guarda el numero (no se suma): cargarlo dos veces no duplica.
 *
 * El operario carga hoy, o ayer si se olvido; el admin, cualquier dia.
 */
export async function accionGuardarLavados(fd: FormData): Promise<Resultado<number>> {
  return ejecutar(async () => {
    const yo = await autorizar("trompo");
    const dia = z.string().regex(FORMATO_DIA, "Elegí el día.").parse(fd.get("dia"));
    const cantidad = z
      .number({ message: "Poné cuántos lavados." })
      .int("Los lavados se cuentan de a uno.")
      .min(0, "No puede ser negativo.")
      .max(50, "¿Tantos lavados? Revisá el número.")
      .parse(Number(fd.get("cantidad")));
    const h = hoy();
    if (dia > h) fallar("No se pueden cargar lavados de un día que no llegó.");
    if (!yo.roles.includes("admin") && dia < sumarDias(h, -1)) {
      fallar("Solo se puede cargar hoy o ayer. Para otro día, pedíselo al administrador.");
    }
    const valores = { cantidad, cargadoPor: yo.nombre, actualizadoEn: new Date() };
    await db
      .insert(lavadosTrompo)
      .values({ dia, ...valores })
      .onConflictDoUpdate({ target: lavadosTrompo.dia, set: valores });
    for (const r of ["/trompo", "/programa", "/produccion"]) revalidatePath(r);
    return cantidad;
  });
}
