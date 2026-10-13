import { NextResponse, type NextRequest } from "next/server";
import { inicioDe, puedeVer } from "./lib/permisos";
import { COOKIE, verificar } from "./lib/session";

/**
 * Control de NAVEGACION, no frontera de seguridad.
 *
 * Corre en el runtime edge, asi que no puede tocar la base: valida la firma del
 * token y nada mas. La revalidacion real -que el usuario siga activo, que el rol
 * no haya cambiado- la hace cada page y cada action contra la base. Ver auth.ts.
 */

/**
 * Valida la sesion por su cuenta (lee la base): por eso puede ir en PUBLICAS.
 * Tiene que estar ahi, porque si no, el redireccionamiento de abajo la mandaria
 * a si misma.
 */
const RENOVAR = "/api/sesion/renovar";

/**
 * `/api/estado` va aca porque su razon de ser es diagnosticar por que alguien
 * NO puede entrar: si exigiera sesion seria inservible justo cuando hace falta.
 * Solo devuelve booleanos y conteos, nunca valores de configuracion.
 */
const PUBLICAS = ["/login", "/sin-permiso", "/api/estado", RENOVAR];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = req.cookies.get(COOKIE)?.value;
  const sesion = token ? await verificar(token) : null;

  if (PUBLICAS.some((p) => pathname.startsWith(p))) {
    // Ya logueado entrando al login: mandarlo a su puesto.
    if (sesion && pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL(inicioDe(sesion.roles), req.url));
    }
    return NextResponse.next();
  }

  if (!sesion) {
    const url = new URL("/login", req.url);
    // Para volver a donde iba despues de entrar.
    if (pathname !== "/") url.searchParams.set("volver", pathname);
    return NextResponse.redirect(url);
  }

  // La raiz no tiene pantalla propia: cada rol cae en su puesto.
  if (pathname === "/") {
    return NextResponse.redirect(new URL(inicioDe(sesion.roles), req.url));
  }

  // El token puede tener roles viejos: si el admin le acaba de sumar un puesto,
  // el menu (que sale de la base) ya lo muestra pero el token todavia no lo
  // trae. Antes de mandarlo a "sin permiso", se renueva el token contra la base.
  if (!puedeVer(sesion.roles, pathname)) {
    const url = new URL(RENOVAR, req.url);
    url.searchParams.set("volver", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icono.svg|manifest.webmanifest).*)"],
};
