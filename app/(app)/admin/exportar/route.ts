import ExcelJS from "exceljs";
import { asc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { requerirRol } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  config,
  estanterias,
  familias,
  modelos,
  motivosRotura,
  movimientos,
  productos,
  tandas,
  usuarios,
} from "@/lib/db/schema";

/**
 * Dos exports distintos:
 *
 *   ?que=maestros  el mismo formato que lee el import. Sirve para el ciclo
 *                  exportar -> editar en la compu -> importar.
 *   ?que=todo      una hoja por tabla, historial incluido.
 *
 * `todo` NO es un backup: restaurar el grafo de claves foraneas desde una
 * planilla no es confiable. Es una copia legible para llevarse los numeros. El
 * backup de verdad es un pg_dump programado.
 */

function hoja(
  libro: ExcelJS.Workbook,
  nombre: string,
  columnas: { header: string; key: string; width: number }[],
  filas: Record<string, unknown>[],
) {
  const h = libro.addWorksheet(nombre);
  h.columns = columnas;
  const enc = h.getRow(1);
  enc.font = { bold: true, color: { argb: "FFFFFFFF" } };
  enc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  h.views = [{ state: "frozen", ySplit: 1 }];
  for (const f of filas) h.addRow(f);
  return h;
}

export async function GET(req: NextRequest) {
  await requerirRol();
  const que = req.nextUrl.searchParams.get("que") === "todo" ? "todo" : "maestros";

  const libro = new ExcelJS.Workbook();
  libro.creator = "Control de Estanterias";
  libro.created = new Date();

  const [fams, mods, prods, ests] = await Promise.all([
    db.select().from(familias).orderBy(asc(familias.orden)),
    db.select().from(modelos).orderBy(asc(modelos.orden)),
    db
      .select({ p: productos, modelo: modelos.nombre, familia: familias.nombre })
      .from(productos)
      .innerJoin(modelos, eq(modelos.id, productos.modeloId))
      .innerJoin(familias, eq(familias.id, productos.familiaId))
      .orderBy(asc(productos.nombre)),
    db
      .select({ e: estanterias, modelo: modelos.nombre, familia: familias.nombre })
      .from(estanterias)
      .innerJoin(modelos, eq(modelos.id, estanterias.modeloId))
      .innerJoin(familias, eq(familias.id, estanterias.familiaId))
      .orderBy(asc(estanterias.codigo)),
  ]);

  hoja(
    libro,
    "Familias",
    [
      { header: "nombre", key: "nombre", width: 34 },
      { header: "orden", key: "orden", width: 10 },
      { header: "activo", key: "activo", width: 10 },
    ],
    fams.map((f) => ({ nombre: f.nombre, orden: f.orden, activo: f.activa ? "si" : "no" })),
  );

  hoja(
    libro,
    "Modelos",
    [
      { header: "nombre", key: "nombre", width: 28 },
      { header: "orden", key: "orden", width: 10 },
      { header: "activo", key: "activo", width: 10 },
    ],
    mods.map((m) => ({ nombre: m.nombre, orden: m.orden, activo: m.activo ? "si" : "no" })),
  );

  hoja(
    libro,
    "Productos",
    [
      { header: "nombre", key: "nombre", width: 30 },
      { header: "modelo", key: "modelo", width: 18 },
      { header: "familia", key: "familia", width: 26 },
      { header: "piezas por molde", key: "ppm", width: 18 },
      { header: "piezas por paquete", key: "ppp", width: 20 },
      { header: "pasa por tunel", key: "tunel", width: 16 },
      { header: "m2 por paquete", key: "m2", width: 16 },
      { header: "activo", key: "activo", width: 10 },
    ],
    prods.map((x) => ({
      nombre: x.p.nombre,
      modelo: x.modelo,
      familia: x.familia,
      ppm: x.p.piezasPorMolde,
      ppp: x.p.piezasPorPaquete,
      tunel: x.p.requiereTunel ? "si" : "no",
      m2: x.p.m2PorPaquete ?? "",
      activo: x.p.activo ? "si" : "no",
    })),
  );

  hoja(
    libro,
    "Estanterias",
    [
      { header: "codigo", key: "codigo", width: 18 },
      { header: "modelo", key: "modelo", width: 18 },
      { header: "familia", key: "familia", width: 26 },
      { header: "moldes", key: "moldes", width: 12 },
      { header: "activo", key: "activo", width: 10 },
    ],
    ests.map((x) => ({
      codigo: x.e.codigo,
      modelo: x.modelo,
      familia: x.familia,
      moldes: x.e.moldes,
      activo: x.e.activa ? "si" : "no",
    })),
  );

  if (que === "todo") {
    const [us, mots, cfg, tds, movs] = await Promise.all([
      db.select().from(usuarios).orderBy(asc(usuarios.nombre)),
      db.select().from(motivosRotura).orderBy(asc(motivosRotura.nombre)),
      db.select().from(config),
      db.select().from(tandas).orderBy(asc(tandas.id)),
      db.select().from(movimientos).orderBy(asc(movimientos.id)),
    ]);

    hoja(
      libro,
      "Usuarios",
      [
        { header: "usuario", key: "usuario", width: 18 },
        { header: "nombre", key: "nombre", width: 26 },
        { header: "rol", key: "rol", width: 16 },
        { header: "activo", key: "activo", width: 10 },
      ],
      // Sin pin_hash: un hash bcrypt en una planilla que despues se manda por
      // mail es material para probar PINs offline, y no sirve para nada.
      us.map((u) => ({
        usuario: u.usuario,
        nombre: u.nombre,
        rol: u.rol,
        activo: u.activo ? "si" : "no",
      })),
    );

    hoja(
      libro,
      "Motivos",
      [
        { header: "nombre", key: "nombre", width: 34 },
        { header: "activo", key: "activo", width: 10 },
      ],
      mots.map((m) => ({ nombre: m.nombre, activo: m.activo ? "si" : "no" })),
    );

    hoja(
      libro,
      "Config",
      [
        { header: "clave", key: "clave", width: 26 },
        { header: "valor", key: "valor", width: 20 },
      ],
      cfg.map((c) => ({ clave: c.clave, valor: c.valor })),
    );

    hoja(
      libro,
      "Tandas",
      [
        { header: "codigo", key: "codigo", width: 14 },
        { header: "producto", key: "producto", width: 28 },
        { header: "modelo", key: "modelo", width: 18 },
        { header: "familia", key: "familia", width: 24 },
        { header: "trompo", key: "trompo", width: 10 },
        { header: "moldes nominal", key: "nominal", width: 16 },
        { header: "moldes llenados", key: "llenados", width: 16 },
        { header: "piezas por molde", key: "ppm", width: 16 },
        { header: "piezas por paquete", key: "ppp", width: 18 },
        { header: "paquetes esperados", key: "esperados", width: 18 },
        { header: "paquetes reales", key: "reales", width: 16 },
        { header: "rotura", key: "rotura", width: 10 },
        { header: "motivo rotura", key: "motivo", width: 26 },
        { header: "m2", key: "m2", width: 12 },
        { header: "estado", key: "estado", width: 14 },
        { header: "creada", key: "creada", width: 20 },
        { header: "estado desde", key: "desde", width: 20 },
      ],
      tds.map((t) => {
        const esperados = Math.floor(
          (t.moldesLlenados * t.piezasPorMolde) / t.piezasPorPaquete,
        );
        return {
          codigo: t.codigo,
          producto: t.productoNombre,
          modelo: t.modeloNombre,
          familia: t.familiaNombre,
          trompo: t.trompo.toUpperCase(),
          nominal: t.moldesNominal ?? "",
          llenados: t.moldesLlenados,
          ppm: t.piezasPorMolde,
          ppp: t.piezasPorPaquete,
          esperados,
          reales: t.paquetes ?? "",
          // Vacio y no cero mientras no se conto: son cosas distintas.
          rotura: t.paquetes === null ? "" : esperados - t.paquetes,
          motivo: t.motivoRoturaNombre ?? "",
          m2: t.paquetes !== null && t.m2PorPaquete ? t.paquetes * Number(t.m2PorPaquete) : "",
          estado: t.estado,
          creada: t.creadaEn,
          desde: t.estadoDesde,
        };
      }),
    );

    hoja(
      libro,
      "Movimientos",
      [
        { header: "cuando", key: "cuando", width: 20 },
        { header: "tanda", key: "tanda", width: 14 },
        { header: "producto", key: "producto", width: 28 },
        { header: "tipo", key: "tipo", width: 20 },
        { header: "desde", key: "desde", width: 14 },
        { header: "hasta", key: "hasta", width: 14 },
        { header: "usuario", key: "usuario", width: 24 },
        { header: "duracion min", key: "dur", width: 14 },
        { header: "trompo", key: "trompo", width: 10 },
        { header: "moldes", key: "moldes", width: 10 },
        { header: "paquetes", key: "paquetes", width: 12 },
        { header: "motivo fraguado", key: "motivo", width: 18 },
        { header: "nota", key: "nota", width: 40 },
      ],
      movs.map((m) => ({
        cuando: m.creadoEn,
        tanda: m.tandaCodigo,
        producto: m.productoNombre,
        tipo: m.tipo,
        desde: m.estadoDesde ?? "",
        hasta: m.estadoHasta,
        usuario: m.usuarioNombre,
        dur: m.duracionMin ?? "",
        trompo: m.trompo ? m.trompo.toUpperCase() : "",
        moldes: m.moldesLlenados ?? "",
        paquetes: m.paquetes ?? "",
        motivo: m.motivoFraguado ?? "",
        nota: m.nota ?? "",
      })),
    );
  }

  const buffer = await libro.xlsx.writeBuffer();
  const hoy = new Date().toISOString().slice(0, 10);
  const nombre = que === "todo" ? `estanterias-completo-${hoy}` : `estanterias-maestros-${hoy}`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}.xlsx"`,
    },
  });
}
