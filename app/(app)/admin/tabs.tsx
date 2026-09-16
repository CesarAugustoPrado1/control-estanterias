"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/admin", etiqueta: "Resumen" },
  { href: "/admin/productos", etiqueta: "Productos" },
  { href: "/admin/estanterias", etiqueta: "Estanterías" },
  { href: "/admin/tarjetas", etiqueta: "Tarjetas" },
  { href: "/admin/imprimir", etiqueta: "Imprimir" },
  { href: "/admin/modelos", etiqueta: "Modelos y familias" },
  { href: "/admin/usuarios", etiqueta: "Usuarios" },
  { href: "/admin/planilla", etiqueta: "Planilla Excel" },
  { href: "/admin/config", etiqueta: "Parámetros" },
];

export function Tabs() {
  const ruta = usePathname();
  return (
    <div className="no-imprimir border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-3 sm:px-5">
        {PESTANAS.map((p) => {
          const activa = ruta === p.href;
          return (
            <Link
              key={p.href}
              href={p.href}
              className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
                activa
                  ? "border-blue-700 text-blue-800"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {p.etiqueta}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
