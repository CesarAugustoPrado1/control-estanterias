import Link from "next/link";
import { sesionDelToken } from "@/lib/session";
import { ETIQUETA_ROL, INICIO_POR_ROL } from "@/lib/permisos";

export const metadata = { title: "Sin permiso" };

export default async function SinPermiso() {
  const s = await sesionDelToken();

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          Esa pantalla no es de tu puesto
        </h1>
        <p className="mt-2 text-slate-600">
          {s ? (
            <>
              Entraste como <strong>{s.nombre}</strong> ({ETIQUETA_ROL[s.rol]}), y
              ese rol no tiene acceso acá. Si necesitás entrar, pedíselo al
              administrador.
            </>
          ) : (
            <>Tu sesión venció.</>
          )}
        </p>
        <Link
          href={s ? INICIO_POR_ROL[s.rol] : "/login"}
          className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"
        >
          {s ? "Ir a mi pantalla" : "Entrar"}
        </Link>
      </div>
    </main>
  );
}
