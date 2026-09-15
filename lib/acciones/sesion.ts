"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BLOQUEO_MIN, INTENTOS_MAX, verificarPin } from "../auth";
import { db } from "../db";
import { usuarios } from "../db/schema";
import { borrarSesion, guardarSesion } from "../session";
import { ejecutar, fallar, type Resultado } from "./comun";
import { INICIO_POR_ROL } from "../permisos";

const esquema = z.object({
  usuario: z.string().trim().min(1, "Escribí tu usuario."),
  pin: z
    .string()
    .regex(/^\d{4,8}$/, "El PIN son 4 a 8 dígitos."),
});

export async function accionEntrar(fd: FormData): Promise<Resultado<string>> {
  return ejecutar(async () => {
    const { usuario, pin } = esquema.parse({
      usuario: String(fd.get("usuario") ?? ""),
      pin: String(fd.get("pin") ?? ""),
    });

    const [u] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.usuario, usuario.toLowerCase()));

    // Mismo mensaje para usuario inexistente y PIN incorrecto: decir cual de
    // los dos fallo le regala al que prueba la mitad del trabajo.
    const generico = "Usuario o PIN incorrecto.";
    if (!u) fallar(generico);
    if (!u.activo) fallar("Tu usuario está dado de baja. Hablá con el administrador.");

    if (u.bloqueadoHasta && u.bloqueadoHasta > new Date()) {
      const min = Math.ceil((u.bloqueadoHasta.getTime() - Date.now()) / 60000);
      fallar(`Demasiados intentos. Probá de nuevo en ${min} minuto(s).`);
    }

    if (!(await verificarPin(pin, u.pinHash))) {
      const intentos = u.intentosFallidos + 1;
      await db
        .update(usuarios)
        .set({
          intentosFallidos: intentos,
          bloqueadoHasta:
            intentos >= INTENTOS_MAX
              ? new Date(Date.now() + BLOQUEO_MIN * 60000)
              : null,
        })
        .where(eq(usuarios.id, u.id));
      if (intentos >= INTENTOS_MAX) {
        fallar(`Demasiados intentos. Esperá ${BLOQUEO_MIN} minutos.`);
      }
      fallar(generico);
    }

    await db
      .update(usuarios)
      .set({ intentosFallidos: 0, bloqueadoHasta: null })
      .where(eq(usuarios.id, u.id));

    await guardarSesion({
      id: u.id,
      usuario: u.usuario,
      nombre: u.nombre,
      rol: u.rol,
    });

    return INICIO_POR_ROL[u.rol];
  });
}

export async function accionSalir(): Promise<void> {
  await borrarSesion();
  redirect("/login");
}
