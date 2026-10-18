"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autorizar } from "../auth";
import { db } from "../db";
import {
  motivosIncumplimiento,
  productos,
  programaDias,
  programaLineas,
  seccionProgramaEnum,
} from "../db/schema";
import { FORMATO_DIA, nombreDia } from "../periodo";
import { tieneAlguno } from "../permisos";
import { leerDia, siguienteOrden } from "../programa";
import { ejecutar, fallar, numeroOpcional, type Resultado } from "./comun";

/**
 * Programa de produccion. Lo arma solo el admin; cada puesto solo
 * informa por que no se cumplio lo suyo. Un dia cerrado no se toca: hay que
 * reabrirlo, y reabrirlo descarta la foto del cumplimiento.
 */

function refrescar() {
  for (const r of ["/programa", "/trompo", "/desmolde"]) revalidatePath(r);
}

const dia = z.string().regex(FORMATO_DIA, "Elegí el día.");
const cantidad = z
  .number({ message: "Poné cuántas maquinadas." })
  .int("Las maquinadas se cuentan de a una.")
  .min(1, "Tiene que ser al menos una maquinada.")
  .max(200, "¿Tantas maquinadas? Revisá el número.");
const nota = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .trim()
    .slice(0, 200) || null;

async function exigirAbierto(d: string) {
  const [cab] = await db.select().from(programaDias).where(eq(programaDias.dia, d));
  if (cab?.cerradoEn) {
    fallar(`El programa del ${nombreDia(d, false)} ya está cerrado. Para cambiarlo, reabrilo primero.`);
  }
}

async function linea(id: number) {
  const [l] = await db.select().from(programaLineas).where(eq(programaLineas.id, id));
  if (!l) fallar("Esa línea ya no existe. Actualizá la pantalla.");
  return l;
}

export async function accionAgregarLinea(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    const yo = await autorizar("admin");
    const d = dia.parse(fd.get("dia"));
    const seccion = z.enum(seccionProgramaEnum.enumValues).parse(fd.get("seccion"));
    const productoId = z
      .number()
      .int()
      .positive("Elegí el producto.")
      .parse(Number(fd.get("productoId")));
    const n = cantidad.parse(numeroOpcional(fd.get("cantidad")) ?? undefined);
    await exigirAbierto(d);
    const [p] = await db.select().from(productos).where(eq(productos.id, productoId));
    if (!p) fallar("Ese producto no existe.");
    if (!p.activo) fallar(`${p.nombre} está dado de baja.`);
    // Al cargar un llenado se puede dejar programado tambien su desmolde. Las
    // advertencias (antes de tiempo, pasarse de la meta) las muestra la
    // pantalla: aca no se bloquea, en planta hay formas de acelerar.
    const desmolde = seccion === "llenado" ? String(fd.get("desmoldeDia") ?? "").trim() : "";
    if (desmolde) {
      dia.parse(desmolde);
      if (desmolde <= d) fallar("El desmolde tiene que ser un día posterior al llenado.");
      await exigirAbierto(desmolde);
    }
    const textoNota = nota(fd.get("nota"));
    await db.transaction(async (tx) => {
      await tx.insert(programaLineas).values({
        dia: d,
        seccion,
        productoId,
        cantidad: n,
        nota: textoNota,
        orden: await siguienteOrden(d, seccion),
        creadaPor: yo.nombre,
      });
      if (desmolde) {
        await tx.insert(programaLineas).values({
          dia: desmolde,
          seccion: "desmolde",
          productoId,
          cantidad: n,
          nota: textoNota,
          orden: await siguienteOrden(desmolde, "desmolde"),
          creadaPor: yo.nombre,
        });
      }
    });
    refrescar();
  });
}

export async function accionEditarLinea(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const l = await linea(Number(fd.get("id")));
    await exigirAbierto(l.dia);
    await db
      .update(programaLineas)
      .set({
        cantidad: cantidad.parse(numeroOpcional(fd.get("cantidad")) ?? undefined),
        nota: nota(fd.get("nota")),
      })
      .where(eq(programaLineas.id, l.id));
    refrescar();
  });
}

export async function accionBorrarLinea(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const l = await linea(Number(fd.get("id")));
    await exigirAbierto(l.dia);
    await db.transaction(async (tx) => {
      // Si era una reprogramacion, la original vuelve a quedar pendiente.
      if (l.origenId) {
        await tx.update(programaLineas).set({ reprogramadaA: null }).where(eq(programaLineas.id, l.origenId));
      }
      // Y si de esta salio otra, esa deja de apuntarle.
      await tx.update(programaLineas).set({ origenId: null }).where(eq(programaLineas.origenId, l.id));
      await tx.delete(programaLineas).where(eq(programaLineas.id, l.id));
    });
    refrescar();
  });
}

/** Sube o baja una linea dentro de su seccion: el orden es el de la hoja. */
export async function accionMoverLinea(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const l = await linea(Number(fd.get("id")));
    await exigirAbierto(l.dia);
    const sube = fd.get("hacia") === "arriba";
    const hermanas = await db
      .select()
      .from(programaLineas)
      .where(and(eq(programaLineas.dia, l.dia), eq(programaLineas.seccion, l.seccion)))
      .orderBy(programaLineas.orden, programaLineas.id);
    const i = hermanas.findIndex((h) => h.id === l.id);
    const j = sube ? i - 1 : i + 1;
    if (j < 0 || j >= hermanas.length) return;
    const orden = hermanas.map((h) => h.id);
    [orden[i], orden[j]] = [orden[j], orden[i]];
    await db.transaction(async (tx) => {
      for (const [k, id] of orden.entries()) {
        await tx
          .update(programaLineas)
          .set({ orden: k + 1 })
          .where(eq(programaLineas.id, id));
      }
    });
    refrescar();
  });
}

/**
 * El puesto informa por que no se cumplio una linea: el trompo las de
 * llenado, el desmolde las suyas. El admin puede cargar o corregir
 * cualquiera, tambien con el dia cerrado.
 */
export async function accionInformarMotivo(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    const yo = await autorizar("trompo", "desmolde");
    const l = await linea(Number(fd.get("id")));
    if (!yo.roles.includes("admin")) {
      const puesto = l.seccion === "llenado" ? "trompo" : "desmolde";
      if (!tieneAlguno(yo.roles, [puesto])) {
        fallar(`Los motivos de ${l.seccion === "llenado" ? "llenado" : "desmolde"} los informa ese puesto.`);
      }
      await exigirAbierto(l.dia);
    }
    const motivoId = numeroOpcional(fd.get("motivoId"));
    if (!motivoId) {
      await db
        .update(programaLineas)
        .set({ motivoId: null, motivoNombre: null, motivoNota: null, motivoPor: null, motivoEn: null })
        .where(eq(programaLineas.id, l.id));
    } else {
      const [m] = await db.select().from(motivosIncumplimiento).where(eq(motivosIncumplimiento.id, motivoId));
      if (!m) fallar("Ese motivo no existe.");
      await db
        .update(programaLineas)
        .set({
          motivoId: m.id,
          motivoNombre: m.nombre,
          motivoNota: nota(fd.get("motivoNota")),
          motivoPor: yo.nombre,
          motivoEn: new Date(),
        })
        .where(eq(programaLineas.id, l.id));
    }
    refrescar();
  });
}

/**
 * Lo que falto de una linea pasa a otro dia, con su nota. La linea nueva
 * recuerda de donde vino y la original, a donde fue.
 */
export async function accionReprogramar(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    const yo = await autorizar("admin");
    const l = await linea(Number(fd.get("id")));
    const destino = dia.parse(fd.get("destino"));
    if (destino === l.dia) fallar("Elegí otro día: es el mismo de la línea.");
    if (l.reprogramadaA) fallar(`Esta línea ya se reprogramó al ${nombreDia(l.reprogramadaA, false)}.`);
    await exigirAbierto(destino);
    const n = cantidad.parse(numeroOpcional(fd.get("cantidad")) ?? undefined);
    await db.transaction(async (tx) => {
      await tx.insert(programaLineas).values({
        dia: destino,
        seccion: l.seccion,
        productoId: l.productoId,
        cantidad: n,
        nota: l.nota,
        orden: await siguienteOrden(destino, l.seccion),
        origenId: l.id,
        creadaPor: yo.nombre,
      });
      await tx.update(programaLineas).set({ reprogramadaA: destino }).where(eq(programaLineas.id, l.id));
    });
    refrescar();
  });
}

/**
 * Cerrar el dia deja registrado el cumplimiento: guarda en cada linea cuanto
 * se hizo. Desde ahi el numero no cambia aunque se corrija alguna maquinada.
 */
export async function accionCerrarDia(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    const yo = await autorizar("admin");
    const d = dia.parse(fd.get("dia"));
    await exigirAbierto(d);
    const actual = await leerDia(d);
    if (!actual.lineas.length) fallar("No hay nada programado ese día.");
    await db.transaction(async (tx) => {
      for (const l of actual.lineas) {
        await tx.update(programaLineas).set({ hechasCierre: l.hechas }).where(eq(programaLineas.id, l.id));
      }
      await tx
        .insert(programaDias)
        .values({ dia: d, cerradoEn: new Date(), cerradoPor: yo.nombre })
        .onConflictDoUpdate({
          target: programaDias.dia,
          set: { cerradoEn: new Date(), cerradoPor: yo.nombre },
        });
    });
    refrescar();
  });
}

/** Meta de maquinadas del dia para una seccion. Vacio la borra. */
export async function accionGuardarMeta(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const d = dia.parse(fd.get("dia"));
    const seccion = z.enum(seccionProgramaEnum.enumValues).parse(fd.get("seccion"));
    const valor = numeroOpcional(fd.get("meta"));
    const meta = valor === null ? null : cantidad.parse(valor);
    const campo = seccion === "llenado" ? { metaLlenado: meta } : { metaDesmolde: meta };
    await db
      .insert(programaDias)
      .values({ dia: d, ...campo })
      .onConflictDoUpdate({ target: programaDias.dia, set: campo });
    refrescar();
  });
}

/** Reabrir descarta la foto: al volver a cerrar se toma lo que haya en ese momento. */
export async function accionReabrirDia(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const d = dia.parse(fd.get("dia"));
    await db.transaction(async (tx) => {
      await tx.update(programaLineas).set({ hechasCierre: null }).where(eq(programaLineas.dia, d));
      await tx.update(programaDias).set({ cerradoEn: null, cerradoPor: null }).where(eq(programaDias.dia, d));
    });
    refrescar();
  });
}

/** Copia las lineas de otro dia (sin lo hecho ni los motivos), al final. */
export async function accionCopiarDia(fd: FormData): Promise<Resultado<number>> {
  return ejecutar(async () => {
    const yo = await autorizar("admin");
    const desde = dia.parse(fd.get("desde"));
    const hacia = dia.parse(fd.get("hacia"));
    if (desde === hacia) fallar("Elegí otro día para copiar.");
    await exigirAbierto(hacia);
    const lineas = await db
      .select()
      .from(programaLineas)
      .where(eq(programaLineas.dia, desde))
      .orderBy(programaLineas.seccion, programaLineas.orden, programaLineas.id);
    if (!lineas.length) fallar(`El ${nombreDia(desde, false)} no tiene nada programado.`);
    const activos = new Set(
      (
        await db
          .select({ id: productos.id })
          .from(productos)
          .where(
            and(
              inArray(productos.id, [...new Set(lineas.map((l) => l.productoId))]),
              eq(productos.activo, true),
            ),
          )
      ).map((p) => p.id),
    );
    let n = 0;
    await db.transaction(async (tx) => {
      const base = {
        llenado: await siguienteOrden(hacia, "llenado"),
        desmolde: await siguienteOrden(hacia, "desmolde"),
      };
      for (const l of lineas) {
        if (!activos.has(l.productoId)) continue;
        await tx.insert(programaLineas).values({
          dia: hacia,
          seccion: l.seccion,
          productoId: l.productoId,
          cantidad: l.cantidad,
          nota: l.nota,
          orden: base[l.seccion]++,
          creadaPor: yo.nombre,
        });
        n++;
      }
    });
    refrescar();
    return n;
  });
}

/** ABM de motivos de incumplimiento, en Parametros. */
export async function guardarMotivoIncumplimiento(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const id = numeroOpcional(fd.get("id"));
    const nombre = z.string().trim().min(1, "Falta el nombre.").parse(fd.get("nombre"));
    const orden = numeroOpcional(fd.get("orden")) ?? 0;
    const activo = fd.get("activo") === "on" || fd.get("activo") === "true";
    const [repetido] = await db
      .select()
      .from(motivosIncumplimiento)
      .where(eq(motivosIncumplimiento.nombre, nombre));
    if (repetido && repetido.id !== id) fallar(`Ya existe el motivo "${nombre}".`);
    if (id) {
      await db
        .update(motivosIncumplimiento)
        .set({ nombre, orden, activo })
        .where(eq(motivosIncumplimiento.id, id));
    } else {
      await db.insert(motivosIncumplimiento).values({ nombre, orden });
    }
    revalidatePath("/admin", "layout");
    refrescar();
  });
}
