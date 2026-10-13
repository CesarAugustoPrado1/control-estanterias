import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { usuarios } from "@/lib/db/schema";
import { puedeVer, rolesDe } from "@/lib/permisos";
import { COOKIE, firmar, OPCIONES_COOKIE, verificar } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Vuelve a firmar el token con los roles que tiene HOY en la base.
 *
 * Llega aca el middleware cuando el token no deja ver una pantalla. Si con los
 * roles nuevos se puede, vuelve a donde iba; si no, a "sin permiso". Nunca
 * redirige de vuelta a algo que no puede ver, asi que no hay bucle.
 */
export async function GET(req: NextRequest) {
  const pedido = req.nextUrl.searchParams.get("volver") ?? "/";
  // Solo rutas propias: "//otro-sitio" o "https://..." no.
  const volver = pedido.startsWith("/") && !pedido.startsWith("//") ? pedido : "/";

  const token = req.cookies.get(COOKIE)?.value;
  const s = token ? await verificar(token) : null;
  if (!s) return NextResponse.redirect(new URL("/login", req.url));

  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, s.id));
  if (!u || !u.activo) return NextResponse.redirect(new URL("/login", req.url));

  const roles = rolesDe(u);
  const ruta = volver.split("?")[0];
  const destino = puedeVer(roles, ruta) ? volver : "/sin-permiso";

  const res = NextResponse.redirect(new URL(destino, req.url));
  res.cookies.set(
    COOKIE,
    await firmar({ id: u.id, usuario: u.usuario, nombre: u.nombre, roles }),
    OPCIONES_COOKIE,
  );
  return res;
}
