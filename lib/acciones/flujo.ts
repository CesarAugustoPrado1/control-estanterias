"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autorizar } from "../auth";
import * as motor from "./motor";
import { ejecutar, ids, numeroOpcional, type Resultado } from "./comun";
import { db } from "../db";
import { motivosRotura } from "../db/schema";
import { eq } from "drizzle-orm";

/**
 * Server actions del circuito. Cada una revalida permisos por su cuenta: el
 * middleware controla navegacion, no invocacion directa de actions.
 */

function refrescar(...rutas: string[]) {
  for (const r of ["/tablero", ...rutas]) revalidatePath(r);
}

const esquemaLlenado = z.object({
  productoId: z.number().int().positive("Elegí un producto."),
  trompo: z.enum(["a", "b"], { message: "Elegí el trompo." }),
  moldesLlenados: z
    .number()
    .int("Los moldes se cuentan de a uno.")
    .positive("Cargá cuántos moldes llenaste.")
    .nullable(),
});

export async function accionLlenar(fd: FormData): Promise<Resultado<{ codigo: string; estanteria: string; moldes: number }>> {
  return ejecutar(async () => {
    const sesion = await autorizar("trompo");
    const datos = esquemaLlenado.parse({
      productoId: Number(fd.get("productoId")),
      trompo: String(fd.get("trompo") ?? ""),
      moldesLlenados: numeroOpcional(fd.get("moldesLlenados")),
    });
    const r = await motor.llenar(sesion, datos);
    refrescar("/trompo", "/horno");
    return r;
  });
}

export async function accionEntrarHorno(fd: FormData): Promise<Resultado<number>> {
  return ejecutar(async () => {
    const sesion = await autorizar("horno");
    const n = await motor.entrarAlHorno(sesion, ids(fd.getAll("tandas")));
    refrescar("/horno", "/desmolde");
    return n;
  });
}

export async function accionSalirHorno(fd: FormData): Promise<Resultado<number>> {
  return ejecutar(async () => {
    const sesion = await autorizar("horno");
    const n = await motor.salirDelHorno(sesion, ids(fd.getAll("tandas")));
    refrescar("/horno", "/desmolde");
    return n;
  });
}

export async function accionFraguadoNatural(fd: FormData): Promise<Resultado<number>> {
  return ejecutar(async () => {
    const sesion = await autorizar("horno");
    const motivo = z
      .enum(["horno_lleno", "clima", "otro"], {
        message: "Elegí por qué se saltea el horno.",
      })
      .parse(String(fd.get("motivo") ?? ""));
    const nota = String(fd.get("nota") ?? "").trim() || null;
    const n = await motor.fraguadoNatural(sesion, ids(fd.getAll("tandas")), motivo, nota);
    refrescar("/horno", "/desmolde");
    return n;
  });
}

export async function accionDevolverAlHorno(fd: FormData): Promise<Resultado<number>> {
  return ejecutar(async () => {
    // Lo informa desmolde, pero el hornero tambien puede registrarlo.
    const sesion = await autorizar("desmolde", "horno");
    const nota = String(fd.get("nota") ?? "").trim() || null;
    const n = await motor.devolverAlHorno(sesion, ids(fd.getAll("tandas")), nota);
    refrescar("/desmolde", "/horno");
    return n;
  });
}

export async function accionDesmoldar(fd: FormData): Promise<Resultado<number>> {
  return ejecutar(async () => {
    const sesion = await autorizar("desmolde");
    const n = await motor.desmoldar(sesion, ids(fd.getAll("tandas")));
    refrescar("/desmolde", "/empaque", "/trompo");
    return n;
  });
}

export async function accionEmpaquetar(
  fd: FormData,
): Promise<Resultado<{ paquetes: number; esperados: number; rotos: number }>> {
  return ejecutar(async () => {
    const sesion = await autorizar("empaque");
    const tandaId = Number(fd.get("tandaId"));
    if (!Number.isInteger(tandaId) || tandaId <= 0) {
      throw new z.ZodError([
        { code: "custom", path: ["tandaId"], message: "Falta la tanda." },
      ]);
    }
    const motivoId = numeroOpcional(fd.get("motivoRoturaId"));
    let motivoNombre: string | null = null;
    if (motivoId) {
      const [m] = await db
        .select()
        .from(motivosRotura)
        .where(eq(motivosRotura.id, motivoId));
      motivoNombre = m?.nombre ?? null;
    }
    const r = await motor.empaquetar(sesion, {
      tandaId,
      paquetes: numeroOpcional(fd.get("paquetes")),
      motivoRoturaId: motivoId,
      motivoRoturaNombre: motivoNombre,
      nota: String(fd.get("nota") ?? "").trim() || null,
    });
    refrescar("/empaque");
    return r;
  });
}

export async function accionCorregir(fd: FormData): Promise<Resultado<string>> {
  return ejecutar(async () => {
    const sesion = await autorizar();
    const estado = z
      .enum(["patio", "horno", "a_desmoldar", "a_empaquetar", "listo"])
      .parse(String(fd.get("estado") ?? ""));
    const codigo = await motor.corregir(sesion, {
      tandaId: Number(fd.get("tandaId")),
      estado,
      moldesLlenados: numeroOpcional(fd.get("moldesLlenados")),
      paquetes: numeroOpcional(fd.get("paquetes")),
      nota: String(fd.get("nota") ?? ""),
    });
    refrescar("/trompo", "/horno", "/desmolde", "/empaque", "/movimientos");
    return codigo;
  });
}
