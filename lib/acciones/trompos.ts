"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autorizar } from "../auth";
import { db } from "../db";
import { tromposFuera } from "../db/schema";
import { FORMATO_DIA, hoy, nombreDia, sumarDias } from "../periodo";
import { leerTromposFuera } from "../programa";
import { ejecutar, fallar, type Resultado } from "./comun";

/**
 * Trompos fuera de servicio (rotura, mantenimiento). Solo el admin. El
 * programa cuenta los lavados con los trompos que andan cada dia.
 */

function refrescar() {
  for (const r of ["/admin/config", "/programa", "/trompo"]) revalidatePath(r);
}

const dia = z.string().regex(FORMATO_DIA, "Elegí el día.");

export async function accionTrompoFuera(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    const yo = await autorizar("admin");
    const trompo = z.enum(["a", "b"], { message: "Elegí el trompo." }).parse(fd.get("trompo"));
    const desde = dia.parse(fd.get("desde") || hoy());
    const hastaCrudo = String(fd.get("hasta") ?? "").trim();
    const hasta = hastaCrudo ? dia.parse(hastaCrudo) : null;
    if (hasta && hasta < desde) fallar("El último día tiene que ser igual o posterior al primero.");
    const motivo = String(fd.get("motivo") ?? "").trim().slice(0, 120) || null;
    // No dos periodos encimados del mismo trompo.
    const encimados = (await leerTromposFuera(desde, hasta ?? "9999-12-31")).filter((f) => f.trompo === trompo);
    if (encimados.length) {
      const f = encimados[0];
      fallar(
        `El trompo ${trompo.toUpperCase()} ya está fuera de servicio desde el ${nombreDia(f.desde, false)}${
          f.hasta ? ` hasta el ${nombreDia(f.hasta, false)}` : ""
        }. Volvelo a servicio o cambiá las fechas.`,
      );
    }
    await db.insert(tromposFuera).values({ trompo, desde, hasta, motivo, creadoPor: yo.nombre });
    refrescar();
  });
}

/**
 * Vuelve a servicio desde hoy: si el periodo todavia no empezo se borra; si ya
 * empezo, termina ayer (queda registrado cuanto estuvo parado).
 */
export async function accionTrompoVuelve(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const id = z.number().int().positive().parse(Number(fd.get("id")));
    const [f] = await db.select().from(tromposFuera).where(eq(tromposFuera.id, id));
    if (!f) fallar("Ese período ya no existe. Actualizá la pantalla.");
    const h = hoy();
    if (f.desde >= h) {
      await db.delete(tromposFuera).where(eq(tromposFuera.id, id));
    } else {
      await db.update(tromposFuera).set({ hasta: sumarDias(h, -1) }).where(eq(tromposFuera.id, id));
    }
    refrescar();
  });
}
