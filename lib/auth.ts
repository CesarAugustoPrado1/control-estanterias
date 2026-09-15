import "server-only";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "./db";
import { usuarios, type Rol } from "./db/schema";
import { sesionDelToken, type Sesion } from "./session";

/**
 * Dos capas de seguridad, y la de arriba NO alcanza sola.
 *
 * El middleware controla la navegacion, pero una server action se puede invocar
 * directamente sin pasar por el: cada action revalida por su cuenta con
 * `autorizar()`.
 *
 * Las dos revalidan contra la base que el usuario siga activo, y el rol de la
 * base PISA al del token. Si el admin da de baja a alguien, la sesion deja de
 * servir en el proximo request en vez de durar los 30 dias del JWT.
 *
 * Diferencia importante entre las dos funciones: en paginas se REDIRIGE, en
 * actions se FALLA CON MENSAJE. `redirect()` lanza una excepcion de control de
 * flujo que dentro de una action se confundiria con un fallo de negocio.
 */

async function vigente(s: Sesion): Promise<Sesion | null> {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, s.id));
  if (!u || !u.activo) return null;
  return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol };
}

/** Para paginas. Redirige al login si no hay sesion valida. */
export async function requerirSesion(): Promise<Sesion> {
  const s = await sesionDelToken();
  if (!s) redirect("/login");
  const v = await vigente(s);
  if (!v) redirect("/login");
  return v;
}

/** Para paginas con rol restringido. */
export async function requerirRol(...roles: Rol[]): Promise<Sesion> {
  const s = await requerirSesion();
  if (s.rol !== "admin" && !roles.includes(s.rol)) redirect("/sin-permiso");
  return s;
}

export class ErrorDeAutorizacion extends Error {}

/** Para server actions. Falla con mensaje, no redirige. */
export async function autorizar(...roles: Rol[]): Promise<Sesion> {
  const s = await sesionDelToken();
  if (!s) throw new ErrorDeAutorizacion("Tu sesión venció. Volvé a entrar.");
  const v = await vigente(s);
  if (!v) {
    throw new ErrorDeAutorizacion(
      "Tu usuario ya no está activo. Hablá con el administrador.",
    );
  }
  if (v.rol !== "admin" && roles.length && !roles.includes(v.rol)) {
    throw new ErrorDeAutorizacion("No tenés permiso para hacer esto.");
  }
  return v;
}

/* -------------------------------------------------------------------------- */
/* PIN                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Un PIN de 4 digitos son 10.000 combinaciones: sin freno se prueba entero en
 * minutos desde cualquier celular. Tras 5 fallos seguidos, 5 minutos de espera.
 */
export const INTENTOS_MAX = 5;
export const BLOQUEO_MIN = 5;

export async function hashearPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verificarPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
