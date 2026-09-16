import { and, asc } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { requerirSesion } from "@/lib/auth";
import { condicionesMovimientos } from "@/lib/consultas";
import { db } from "@/lib/db";
import { movimientos, tipoMovimientoEnum, type TipoMovimiento } from "@/lib/db/schema";
import { ETIQUETA_MOTIVO_FRAGUADO, ETIQUETA_MOVIMIENTO } from "@/lib/estados";

/**
 * Export CSV del historial, respetando los filtros de la pantalla.
 *
 * Separador `;` y BOM UTF-8: es lo que hace que Excel en español abra el
 * archivo con las columnas separadas y los acentos bien sin pedir nada. Con
 * coma y sin BOM, el mismo archivo se ve como una sola columna con simbolos
 * raros, y el usuario concluye -razonablemente- que la app exporta mal.
 */
export async function GET(req: NextRequest) {
  await requerirSesion();

  const p = req.nextUrl.searchParams;
  const tipos = tipoMovimientoEnum.enumValues as readonly string[];
  const tipoParam = p.get("tipo");

  const w = condicionesMovimientos({
    tipo: tipoParam && tipos.includes(tipoParam) ? (tipoParam as TipoMovimiento) : undefined,
    usuarioId: Number(p.get("usuarioId")) || undefined,
    desde: p.get("desde") || undefined,
    hasta: p.get("hasta") || undefined,
    texto: p.get("texto") || undefined,
  });

  const filas = await db
    .select()
    .from(movimientos)
    .where(w.length ? and(...w) : undefined)
    .orderBy(asc(movimientos.creadoEn), asc(movimientos.id));

  const cabecera = [
    "Fecha",
    "Hora",
    "Tanda",
    "Producto",
    "Movimiento",
    "Estado desde",
    "Estado hasta",
    "Usuario",
    "Duracion (min)",
    "Duracion (h)",
    "Trompo",
    "Moldes llenados",
    "Paquetes",
    "Motivo fraguado",
    "Nota",
  ];

  const escapar = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const tz = "America/Argentina/Buenos_Aires";
  const fFecha = new Intl.DateTimeFormat("es-AR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const fHora = new Intl.DateTimeFormat("es-AR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  });

  const lineas = [cabecera.join(";")];
  for (const m of filas) {
    lineas.push(
      [
        fFecha.format(m.creadoEn),
        fHora.format(m.creadoEn),
        m.tandaCodigo,
        m.productoNombre,
        ETIQUETA_MOVIMIENTO[m.tipo],
        m.estadoDesde ?? "",
        m.estadoHasta,
        m.usuarioNombre,
        m.duracionMin ?? "",
        // Con coma decimal, que es lo que espera Excel en es-AR.
        m.duracionMin === null ? "" : (m.duracionMin / 60).toFixed(2).replace(".", ","),
        m.trompo ? m.trompo.toUpperCase() : "",
        m.moldesLlenados ?? "",
        m.paquetes ?? "",
        m.motivoFraguado ? ETIQUETA_MOTIVO_FRAGUADO[m.motivoFraguado] : "",
        m.nota ?? "",
      ]
        .map(escapar)
        .join(";"),
    );
  }

  const hoy = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + lineas.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movimientos-${hoy}.csv"`,
    },
  });
}
