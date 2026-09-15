"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { accionSalir } from "@/lib/acciones/sesion";
import { ETIQUETA_ROL, navegacionDe } from "@/lib/permisos";
import type { Rol } from "@/lib/db/schema";

export function Navegacion({
  rol,
  nombre,
}: {
  rol: Rol;
  nombre: string;
}) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const entradas = navegacionDe(rol);

  const activa = (href: string) =>
    ruta === href || ruta.startsWith(href + "/");

  return (
    <header className="no-imprimir sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-3 py-2 sm:px-5">
        <Link href="/" className="flex items-center gap-2 font-bold text-blue-800">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-blue-700 text-sm text-white">
            E
          </span>
          <span className="hidden sm:inline">Estanterías</span>
        </Link>

        {/* En escritorio la barra entera; en celular, solo el puesto actual. */}
        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {entradas.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                activa(e.href)
                  ? "bg-blue-700 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {e.etiqueta}
            </Link>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-semibold leading-tight text-slate-800">
              {nombre}
            </div>
            <div className="text-xs leading-tight text-slate-500">
              {ETIQUETA_ROL[rol]}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            aria-label="Menú"
            className="grid h-11 w-11 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 md:hidden"
          >
            <span className="text-xl leading-none">{abierto ? "✕" : "☰"}</span>
          </button>
          <form action={accionSalir} className="hidden md:block">
            <button
              type="submit"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Salir
            </button>
          </form>
        </div>
      </div>

      {abierto && (
        <nav className="border-t border-slate-200 bg-white px-3 pb-3 md:hidden">
          <div className="border-b border-slate-100 py-2 text-sm text-slate-600">
            {nombre} · {ETIQUETA_ROL[rol]}
          </div>
          {entradas.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              onClick={() => setAbierto(false)}
              className={`block rounded-lg px-3 py-3 text-base font-semibold ${
                activa(e.href)
                  ? "bg-blue-700 text-white"
                  : "text-slate-800 hover:bg-slate-100"
              }`}
            >
              {e.etiqueta}
            </Link>
          ))}
          <form action={accionSalir}>
            <button
              type="submit"
              className="mt-1 block w-full rounded-lg px-3 py-3 text-left text-base font-semibold text-red-700 hover:bg-red-50"
            >
              Salir
            </button>
          </form>
        </nav>
      )}
    </header>
  );
}
