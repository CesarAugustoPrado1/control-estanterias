import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Rol } from "./db/schema";
import { ErrorDeConfiguracion } from "./errores";

/**
 * Sesion en un JWT firmado, dentro de una cookie httpOnly. Sin tabla de
 * sesiones: para este volumen, una tabla mas seria una consulta mas por request
 * sin nada a cambio.
 *
 * Lo que va adentro del token es lo minimo para dibujar la pantalla. El rol se
 * REVALIDA contra la base en cada page y en cada action (ver auth.ts): si el
 * admin da de baja a alguien o le cambia el rol, no queremos esperar 30 dias a
 * que venza el token.
 */

export const COOKIE = "sesion";
const DIAS = 30;

export type Sesion = { id: number; usuario: string; nombre: string; rol: Rol };

function clave(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    throw new ErrorDeConfiguracion(
      "El servidor no tiene configurada la variable SESSION_SECRET, así que no " +
        "puede firmar la sesión. Hay que cargarla en Vercel (Settings > " +
        "Environment Variables, marcando Production) y volver a desplegar: las " +
        "variables nuevas no se aplican al deploy que ya estaba hecho.",
    );
  }
  return new TextEncoder().encode(s);
}

export async function firmar(s: Sesion): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DIAS}d`)
    .sign(clave());
}

/** Verifica el token. Sirve tambien en el middleware (runtime edge). */
export async function verificar(token: string): Promise<Sesion | null> {
  try {
    const { payload } = await jwtVerify(token, clave());
    const { id, usuario, nombre, rol } = payload as unknown as Sesion;
    if (typeof id !== "number" || !usuario || !rol) return null;
    return { id, usuario, nombre, rol };
  } catch {
    return null;
  }
}

export async function guardarSesion(s: Sesion): Promise<void> {
  const token = await firmar(s);
  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DIAS * 24 * 3600,
  });
}

export async function borrarSesion(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}

/** Sesion del token, SIN revalidar contra la base. Ver auth.ts. */
export async function sesionDelToken(): Promise<Sesion | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  return verificar(token);
}
