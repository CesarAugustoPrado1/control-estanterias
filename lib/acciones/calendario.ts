"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autorizar } from "../auth";
import { db } from "../db";
import { calendario } from "../db/schema";
import { FORMATO_DIA } from "../periodo";
import { ejecutar, type Resultado } from "./comun";

/**
 * Calendario de dias habiles (ver lib/calendario.ts). Solo el admin.
 * Guardar un dia lo vuelve excepcion; quitarlo lo devuelve a la regla de
 * lunes a viernes.
 */

const dia = z.string().regex(FORMATO_DIA, "Elegí el día.");

function refrescar() {
  revalidatePath("/admin/calendario");
  revalidatePath("/programa");
}

export async function accionGuardarDiaCalendario(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    const yo = await autorizar("admin");
    const d = dia.parse(fd.get("dia"));
    const laborable = fd.get("laborable") === "1";
    const nombreCrudo = fd.get("nombre");
    const valores = {
      laborable,
      actualizadoPor: yo.nombre,
      actualizadoEn: new Date(),
      // Sin "nombre" en el formulario (el boton de cambiar), se conserva el que tenia.
      ...(nombreCrudo === null ? {} : { nombre: String(nombreCrudo).trim().slice(0, 120) || null }),
    };
    await db
      .insert(calendario)
      .values({ dia: d, nombre: null, ...valores })
      .onConflictDoUpdate({ target: calendario.dia, set: valores });
    refrescar();
  });
}

export async function accionQuitarDiaCalendario(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    await db.delete(calendario).where(eq(calendario.dia, dia.parse(fd.get("dia"))));
    refrescar();
  });
}
