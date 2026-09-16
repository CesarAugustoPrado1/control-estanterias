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
  estanteriaId: z.number().int().positive("Elegí la estantería por su placa."),
  productoId: z.number().int().positive("Elegí el tono."),
  trompo: z.enum(["a", "b"], { message: "Elegí el trompo." }),
  moldesLlenados: z
    .number()
    .int("Los moldes se cuentan de a uno.")
    .positive("Cargá cuántos moldes llenaste.")
    .nullable(),
  confirmoLavado: z.boolean(),
});

export async function accionLlenar(
  fd: FormData,
): Promise<Resultado<Awaited<ReturnType<typeof motor.llenar>>>> {
  return ejecutar(async () => {
    const sesion = await autorizar("trompo");
    const datos = esquemaLlenado.parse({
      estanteriaId: Number(fd.get("estanteriaId")),
      productoId: Number(fd.get("productoId")),
      trompo: String(fd.get("trompo") ?? ""),
      moldesLlenados: numeroOpcional(fd.get("moldesLlenados")),
      confirmoLavado: fd.get("confirmoLavado") === "on" || fd.get("confirmoLavado") === "true",
    });
    const r = await motor.llenar(sesion, datos);
    refrescar("/trompo", "/horno", "/recorrida");
    return r;
  });
}

export async function accionTarjetaNoEncontrada(
  fd: FormData,
): Promise<Resultado<Awaited<ReturnType<typeof motor.tarjetaNoEncontrada>>>> {
  return ejecutar(async () => {
    const sesion = await autorizar("trompo");
    const r = await motor.tarjetaNoEncontrada(sesion, Number(fd.get("tandaId")));
    refrescar("/trompo", "/horno", "/recorrida");
    return r;
  });
}

export async function accionNoCoincide(fd: FormData): Promise<Resultado<string>> {
  return ejecutar(async () => {
    const sesion = await autorizar("desmolde", "horno", "empaque");
    const r = await motor.informarNoCoincide(
      sesion,
      Number(fd.get("tandaId")),
      String(fd.get("placaVista") ?? ""),
    );
    refrescar("/desmolde", "/recorrida");
    return r;
  });
}

export async function accionResolverAviso(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    const sesion = await autorizar();
    await motor.resolverAviso(sesion, Number(fd.get("avisoId")), String(fd.get("resolucion") ?? ""));
    refrescar("/recorrida");
  });
}

export async function accionTarjetaEncontrada(fd: FormData): Promise<Resultado<string>> {
  return ejecutar(async () => {
    await autorizar();
    const r = await motor.tarjetaEncontrada(Number(fd.get("tarjetaId")));
    refrescar("/recorrida", "/admin/tarjetas");
    return r;
  });
}

export async function accionGuardarFabricadas(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar();
    const valores: Record<string, number> = {};
    for (const l of ["A", "B", "C", "D", "E", "F", "G"]) {
      const v = numeroOpcional(fd.get(`fabricadas_${l}`));
      if (v !== null) valores[l] = v;
    }
    await motor.guardarFabricadas(valores);
    refrescar("/admin/tarjetas", "/trompo");
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
    refrescar("/desmolde", "/empaque", "/trompo", "/recorrida");
    return n;
  });
}

export async function accionEmpaquetar(
  fd: FormData,
): Promise<Resultado<Awaited<ReturnType<typeof motor.empaquetar>>>> {
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
    refrescar("/empaque", "/recorrida");
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
