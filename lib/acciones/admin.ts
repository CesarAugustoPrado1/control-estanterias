"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autorizar, hashearPin } from "../auth";
import { db } from "../db";
import {
  config,
  estanterias,
  familias,
  modelos,
  motivosRotura,
  productos,
  rolEnum,
  tandas,
  usuarios,
} from "../db/schema";
import * as motor from "./motor";
import { ejecutar, fallar, numeroOpcional, type Resultado } from "./comun";

/**
 * ABM. Nada se borra nunca: se da de baja.
 *
 * Un producto dado de baja no se puede elegir en el trompo, pero sigue
 * apareciendo en el historial de las tandas que lo usaron. Borrar la fila
 * dejaria huerfano todo lo que la referencia, y el historial es justamente lo
 * que la app existe para conservar.
 */

function refrescarAdmin() {
  revalidatePath("/admin", "layout");
  revalidatePath("/trompo");
  revalidatePath("/tablero");
}

const texto = (min = 1) => z.string().trim().min(min, "Falta el nombre.");

/* -------------------------------------------------------------------------- */
/* Familias y modelos                                                         */
/* -------------------------------------------------------------------------- */

export async function guardarFamilia(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar();
    const id = numeroOpcional(fd.get("id"));
    const nombre = texto().parse(fd.get("nombre"));
    const orden = numeroOpcional(fd.get("orden")) ?? 0;
    const activa = fd.get("activa") === "on" || fd.get("activa") === "true";

    const repetida = await db
      .select()
      .from(familias)
      .where(id ? and(eq(familias.nombre, nombre), ne(familias.id, id)) : eq(familias.nombre, nombre));
    if (repetida.length) fallar(`Ya existe una familia llamada "${nombre}".`);

    if (id) {
      await db.update(familias).set({ nombre, orden, activa }).where(eq(familias.id, id));
    } else {
      await db.insert(familias).values({ nombre, orden });
    }
    refrescarAdmin();
  });
}

export async function guardarModelo(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar();
    const id = numeroOpcional(fd.get("id"));
    const nombre = texto().parse(fd.get("nombre"));
    const orden = numeroOpcional(fd.get("orden")) ?? 0;
    const activo = fd.get("activo") === "on" || fd.get("activo") === "true";

    const repetido = await db
      .select()
      .from(modelos)
      .where(id ? and(eq(modelos.nombre, nombre), ne(modelos.id, id)) : eq(modelos.nombre, nombre));
    if (repetido.length) fallar(`Ya existe un modelo llamado "${nombre}".`);

    if (id) {
      await db.update(modelos).set({ nombre, orden, activo }).where(eq(modelos.id, id));
    } else {
      await db.insert(modelos).values({ nombre, orden });
    }
    refrescarAdmin();
  });
}

/* -------------------------------------------------------------------------- */
/* Productos                                                                  */
/* -------------------------------------------------------------------------- */

const esquemaProducto = z.object({
  nombre: texto(),
  modeloId: z.number().int().positive("Elegí el modelo."),
  familiaId: z.number().int().positive("Elegí la familia."),
  piezasPorMolde: z
    .number()
    .int()
    .min(1, "Tiene que ser 1 o más.")
    .max(20, "¿Tantas piezas por molde? Revisá el número."),
  piezasPorPaquete: z
    .number()
    .int()
    .min(1, "Tiene que ser 1 o más.")
    .max(20, "¿Tantas piezas por paquete? Revisá el número."),
  requiereTunel: z.boolean(),
  cemento: z.enum(["gris", "blanco"], { message: "Elegí el cemento." }),
  m2PorPaquete: z.string().nullable(),
});

export async function guardarProducto(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar();
    const id = numeroOpcional(fd.get("id"));

    const m2 = String(fd.get("m2PorPaquete") ?? "").trim().replace(",", ".");
    if (m2 !== "" && !/^\d+(\.\d{1,4})?$/.test(m2)) {
      fallar("Los m² por paquete tienen que ser un número, por ejemplo 0,26.");
    }

    const datos = esquemaProducto.parse({
      nombre: fd.get("nombre"),
      modeloId: Number(fd.get("modeloId")),
      familiaId: Number(fd.get("familiaId")),
      piezasPorMolde: Number(fd.get("piezasPorMolde")),
      piezasPorPaquete: Number(fd.get("piezasPorPaquete")),
      requiereTunel: fd.get("requiereTunel") === "on" || fd.get("requiereTunel") === "true",
      cemento: String(fd.get("cemento") ?? "gris"),
      m2PorPaquete: m2 === "" ? null : m2,
    });
    const activo = fd.get("activo") === "on" || fd.get("activo") === "true";

    if (id) {
      // Cambiar las conversiones NO reescribe el pasado: cada tanda guarda las
      // suyas al llenarse. De otro modo, corregir un factor cambiaria en
      // silencio la rotura de todos los meses anteriores.
      await db.update(productos).set({ ...datos, activo }).where(eq(productos.id, id));
    } else {
      await db.insert(productos).values(datos);
    }
    refrescarAdmin();
  });
}

/* -------------------------------------------------------------------------- */
/* Estanterias                                                                */
/* -------------------------------------------------------------------------- */

export async function guardarEstanteria(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    const sesion = await autorizar();
    const numero = z
      .number({ invalid_type_error: "Cargá el número de la placa." })
      .int("El número de placa es un entero.")
      .min(1, "El número de placa empieza en 1.")
      .max(999, "¿Un número de placa tan grande? Revisalo.")
      .parse(numeroOpcional(fd.get("numero")));
    await motor.guardarEstanteria(sesion, {
      id: numeroOpcional(fd.get("id")),
      codigo: String(fd.get("codigo") ?? "").trim() || null,
      modeloId: z.number().int().positive("Elegí el modelo.").parse(Number(fd.get("modeloId"))),
      familiaId: z.number().int().positive("Elegí la familia.").parse(Number(fd.get("familiaId"))),
      cemento: z
        .enum(["gris", "blanco"], { message: "Elegí el cemento." })
        .parse(String(fd.get("cemento") ?? "")),
      numero,
      moldes: z
        .number()
        .int("Los moldes se cuentan de a uno.")
        .min(1, "Tiene que tener al menos un molde.")
        .parse(Number(fd.get("moldes"))),
      // Un checkbox destildado no viaja en el formulario: ausente es "no". Al
      // crear no se usa -la estanteria nace activa-.
      activa: fd.get("activa") === "on" || fd.get("activa") === "true",
      motivo: String(fd.get("motivo") ?? "").trim() || null,
    });
    refrescarAdmin();
  });
}

/* -------------------------------------------------------------------------- */
/* Motivos y configuracion                                                    */
/* -------------------------------------------------------------------------- */

export async function guardarMotivo(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar();
    const id = numeroOpcional(fd.get("id"));
    const nombre = texto().parse(fd.get("nombre"));
    const activo = fd.get("activo") === "on" || fd.get("activo") === "true";
    if (id) {
      await db.update(motivosRotura).set({ nombre, activo }).where(eq(motivosRotura.id, id));
    } else {
      await db.insert(motivosRotura).values({ nombre });
    }
    refrescarAdmin();
  });
}

export async function guardarConfig(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar();
    const cupo = z
      .number()
      .int("Tiene que ser un número entero.")
      .min(1, "El horno tiene que tener al menos un lugar.")
      .max(500, "¿Tantos lugares? Revisá el número.")
      .parse(Number(fd.get("capacidadHorno")));

    await db
      .insert(config)
      .values({ clave: "capacidad_horno", valor: String(cupo) })
      .onConflictDoUpdate({
        target: config.clave,
        set: { valor: String(cupo) },
      });
    refrescarAdmin();
    revalidatePath("/horno");
  });
}

/* -------------------------------------------------------------------------- */
/* Usuarios                                                                   */
/* -------------------------------------------------------------------------- */

export async function guardarUsuario(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    const yo = await autorizar();
    const id = numeroOpcional(fd.get("id"));
    const usuario = z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{2,20}$/, "El usuario son 2 a 20 letras, números, punto o guion.")
      .parse(fd.get("usuario"));
    const nombre = texto(2).parse(fd.get("nombre"));
    const rol = z.enum(rolEnum.enumValues, { message: "Elegí un rol." }).parse(fd.get("rol"));
    const activo = fd.get("activo") === "on" || fd.get("activo") === "true";
    const pin = String(fd.get("pin") ?? "").trim();

    if (pin !== "" && !/^\d{4,8}$/.test(pin)) {
      fallar("El PIN son 4 a 8 dígitos.");
    }

    const repetido = await db
      .select()
      .from(usuarios)
      .where(id ? and(eq(usuarios.usuario, usuario), ne(usuarios.id, id)) : eq(usuarios.usuario, usuario));
    if (repetido.length) fallar(`Ya existe un usuario "${usuario}".`);

    if (id) {
      // Que un admin se saque a si mismo el rol o se desactive deja el sistema
      // sin nadie que pueda arreglarlo.
      if (id === yo.id && (rol !== "admin" || !activo)) {
        fallar(
          "No podés quitarte a vos mismo el rol de administrador ni darte de baja. " +
            "Pedile a otro admin que lo haga.",
        );
      }
      await db
        .update(usuarios)
        .set({
          usuario,
          nombre,
          rol,
          activo,
          ...(pin ? { pinHash: await hashearPin(pin), intentosFallidos: 0, bloqueadoHasta: null } : {}),
        })
        .where(eq(usuarios.id, id));
    } else {
      if (!pin) fallar("Poné un PIN inicial de 4 a 8 dígitos.");
      await db
        .insert(usuarios)
        .values({ usuario, nombre, rol, pinHash: await hashearPin(pin) });
    }
    refrescarAdmin();
  });
}

/** Destraba a alguien que se pasó de intentos sin tener que esperar. */
export async function desbloquearUsuario(fd: FormData): Promise<Resultado<void>> {
  return ejecutar(async () => {
    await autorizar();
    const id = Number(fd.get("id"));
    await db
      .update(usuarios)
      .set({ intentosFallidos: 0, bloqueadoHasta: null })
      .where(eq(usuarios.id, id));
    refrescarAdmin();
  });
}
