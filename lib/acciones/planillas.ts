"use server";

import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { autorizar } from "../auth";
import { db } from "../db";
import { estanterias, familias, modelos, productos } from "../db/schema";
import { ejecutar, fallar, type Resultado } from "./comun";

/**
 * Import de planillas, con dos reglas que no se negocian:
 *
 * 1. LA PLANILLA NUNCA BORRA. Lo que no esta en el archivo queda como estaba.
 *    Subir una planilla recortada por error no puede vaciar la instalacion.
 * 2. O ENTRA TODO O NO ENTRA NADA. Una sola fila con problema rechaza el
 *    archivo entero: despues de un import a medias nadie sabe que quedo
 *    aplicado, y reconstruirlo a mano es peor que volver a subir el archivo.
 *
 * Por eso son dos pasos: `analizar` muestra fila por fila que va a pasar y
 * `importar` lo aplica en una transaccion.
 *
 * La lectura es TOLERANTE con el archivo y ESTRICTA con los datos: acentos,
 * mayusculas, columnas de mas, filas en blanco y alias de encabezado no
 * molestan; un numero mal puesto si, y el error dice que fila y que columna.
 */

export type Accion = "crear" | "actualizar" | "sin cambios" | "error";

export type FilaAnalisis = {
  hoja: string;
  fila: number;
  accion: Accion;
  descripcion: string;
  detalle?: string;
};

export type Analisis = {
  filas: FilaAnalisis[];
  crear: number;
  actualizar: number;
  sinCambios: number;
  errores: number;
};

/* -------------------------------------------------------------------------- */
/* Lectura tolerante                                                          */
/* -------------------------------------------------------------------------- */

/** Sin acentos, sin mayusculas, sin espacios de mas. */
function normalizar(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const ALIAS: Record<string, string> = {
  nombre: "nombre",
  producto: "nombre",
  descripcion: "nombre",
  codigo: "codigo",
  modelo: "modelo",
  forma: "modelo",
  familia: "familia",
  color: "familia",
  orden: "orden",
  moldes: "moldes",
  "cantidad de moldes": "moldes",
  "piezas por molde": "piezasPorMolde",
  "piezas molde": "piezasPorMolde",
  "piezas por paquete": "piezasPorPaquete",
  "piezas paquete": "piezasPorPaquete",
  "pasa por tunel": "requiereTunel",
  tunel: "requiereTunel",
  "requiere tunel": "requiereTunel",
  "m2 por paquete": "m2PorPaquete",
  m2: "m2PorPaquete",
  "metros por paquete": "m2PorPaquete",
  activo: "activo",
  activa: "activo",
};

type Fila = { n: number; datos: Record<string, string> };

function leerHoja(libro: ExcelJS.Workbook, nombres: string[]): Fila[] | null {
  const hoja = libro.worksheets.find((h) =>
    nombres.some((n) => normalizar(h.name) === normalizar(n)),
  );
  if (!hoja) return null;

  const encabezados: Record<number, string> = {};
  hoja.getRow(1).eachCell((celda, col) => {
    const clave = ALIAS[normalizar(texto(celda))];
    // Las columnas no reconocidas se ignoran en silencio: una planilla con una
    // columna de notas propia tiene que poder importarse igual.
    if (clave) encabezados[col] = clave;
  });

  const filas: Fila[] = [];
  hoja.eachRow((fila, n) => {
    if (n === 1) return;
    const datos: Record<string, string> = {};
    let hayAlgo = false;
    for (const [col, clave] of Object.entries(encabezados)) {
      const v = texto(fila.getCell(Number(col))).trim();
      datos[clave] = v;
      if (v !== "") hayAlgo = true;
    }
    if (hayAlgo) filas.push({ n, datos });
  });
  return filas;
}

function texto(celda: ExcelJS.Cell | undefined): string {
  if (!celda) return "";
  const v = celda.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return String((v as { result: unknown }).result ?? "");
    if ("richText" in v) {
      return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    }
  }
  return String(v);
}

function aEntero(v: string, campo: string, fila: number, hoja: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    fallar(`${hoja}, fila ${fila}: "${campo}" tiene que ser un número entero, y dice "${v}".`);
  }
  return n;
}

function aDecimal(v: string, campo: string, fila: number, hoja: string): string | null {
  if (v.trim() === "") return null;
  const s = v.replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(s)) {
    fallar(`${hoja}, fila ${fila}: "${campo}" tiene que ser un número, y dice "${v}".`);
  }
  return s;
}

function aBooleano(v: string, pordefecto: boolean): boolean {
  const n = normalizar(v);
  if (n === "") return pordefecto;
  return ["si", "s", "true", "1", "x", "verdadero"].includes(n);
}

/* -------------------------------------------------------------------------- */
/* Analisis                                                                   */
/* -------------------------------------------------------------------------- */

type Plan = {
  familias: { nombre: string; orden: number | null; existe: boolean }[];
  modelos: { nombre: string; orden: number | null; existe: boolean }[];
  productos: {
    nombre: string;
    modelo: string;
    familia: string;
    piezasPorMolde: number;
    piezasPorPaquete: number;
    requiereTunel: boolean;
    m2PorPaquete: string | null;
    activo: boolean;
    idExistente: number | null;
    cambia: boolean;
  }[];
  estanterias: {
    codigo: string;
    modelo: string;
    familia: string;
    moldes: number;
    activa: boolean;
    idExistente: number | null;
    cambia: boolean;
  }[];
};

async function construirPlan(buffer: ArrayBuffer): Promise<{ plan: Plan; analisis: Analisis }> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);

  const [famBase, modBase, prodBase, estBase] = await Promise.all([
    db.select().from(familias),
    db.select().from(modelos),
    db.select().from(productos),
    db.select().from(estanterias),
  ]);

  const famPorNombre = new Map(famBase.map((f) => [normalizar(f.nombre), f]));
  const modPorNombre = new Map(modBase.map((m) => [normalizar(m.nombre), m]));
  const prodPorNombre = new Map(prodBase.map((p) => [normalizar(p.nombre), p]));
  const estPorCodigo = new Map(estBase.map((e) => [normalizar(e.codigo), e]));

  const filas: FilaAnalisis[] = [];
  const plan: Plan = { familias: [], modelos: [], productos: [], estanterias: [] };

  // --- Familias
  const hojaFam = leerHoja(libro, ["Familias", "Familia", "Colores"]) ?? [];
  const famNuevas = new Set<string>();
  for (const f of hojaFam) {
    const nombre = f.datos.nombre?.trim() ?? "";
    if (!nombre) fallar(`Familias, fila ${f.n}: falta el nombre.`);
    const existe = famPorNombre.has(normalizar(nombre));
    plan.familias.push({
      nombre,
      orden: aEntero(f.datos.orden ?? "", "orden", f.n, "Familias"),
      existe,
    });
    famNuevas.add(normalizar(nombre));
    filas.push({
      hoja: "Familias",
      fila: f.n,
      accion: existe ? "sin cambios" : "crear",
      descripcion: nombre,
    });
  }

  // --- Modelos
  const hojaMod = leerHoja(libro, ["Modelos", "Modelo", "Formas"]) ?? [];
  const modNuevos = new Set<string>();
  for (const m of hojaMod) {
    const nombre = m.datos.nombre?.trim() ?? "";
    if (!nombre) fallar(`Modelos, fila ${m.n}: falta el nombre.`);
    const existe = modPorNombre.has(normalizar(nombre));
    plan.modelos.push({
      nombre,
      orden: aEntero(m.datos.orden ?? "", "orden", m.n, "Modelos"),
      existe,
    });
    modNuevos.add(normalizar(nombre));
    filas.push({
      hoja: "Modelos",
      fila: m.n,
      accion: existe ? "sin cambios" : "crear",
      descripcion: nombre,
    });
  }

  const conoceModelo = (n: string) =>
    modPorNombre.has(normalizar(n)) || modNuevos.has(normalizar(n));
  const conoceFamilia = (n: string) =>
    famPorNombre.has(normalizar(n)) || famNuevas.has(normalizar(n));

  // --- Productos
  const hojaProd = leerHoja(libro, ["Productos", "Producto"]) ?? [];
  for (const p of hojaProd) {
    const H = "Productos";
    const nombre = p.datos.nombre?.trim() ?? "";
    if (!nombre) fallar(`${H}, fila ${p.n}: falta el nombre.`);
    const modelo = p.datos.modelo?.trim() ?? "";
    const familia = p.datos.familia?.trim() ?? "";
    if (!conoceModelo(modelo)) {
      fallar(
        `${H}, fila ${p.n}: el modelo "${modelo}" no existe. Cargalo en la hoja Modelos o revisá cómo está escrito.`,
      );
    }
    if (!conoceFamilia(familia)) {
      fallar(
        `${H}, fila ${p.n}: la familia "${familia}" no existe. Cargala en la hoja Familias o revisá cómo está escrita.`,
      );
    }
    const ppm = aEntero(p.datos.piezasPorMolde ?? "", "piezas por molde", p.n, H) ?? 1;
    const ppp = aEntero(p.datos.piezasPorPaquete ?? "", "piezas por paquete", p.n, H) ?? 1;
    if (ppm < 1 || ppp < 1) {
      fallar(`${H}, fila ${p.n}: las piezas por molde y por paquete tienen que ser 1 o más.`);
    }
    const m2 = aDecimal(p.datos.m2PorPaquete ?? "", "m2 por paquete", p.n, H);
    const tunel = aBooleano(p.datos.requiereTunel ?? "", true);
    const activo = aBooleano(p.datos.activo ?? "", true);

    const ya = prodPorNombre.get(normalizar(nombre));
    const cambia =
      !!ya &&
      (ya.piezasPorMolde !== ppm ||
        ya.piezasPorPaquete !== ppp ||
        ya.requiereTunel !== tunel ||
        ya.activo !== activo ||
        (ya.m2PorPaquete ?? null) !== m2);

    plan.productos.push({
      nombre,
      modelo,
      familia,
      piezasPorMolde: ppm,
      piezasPorPaquete: ppp,
      requiereTunel: tunel,
      m2PorPaquete: m2,
      activo,
      idExistente: ya?.id ?? null,
      cambia,
    });
    filas.push({
      hoja: H,
      fila: p.n,
      accion: !ya ? "crear" : cambia ? "actualizar" : "sin cambios",
      descripcion: nombre,
      detalle: `${ppm} pieza(s)/molde · ${ppp} pieza(s)/paquete · ${tunel ? "con túnel" : "sin túnel"}${m2 ? ` · ${m2} m²` : ""}`,
    });
  }

  // --- Estanterias
  const hojaEst = leerHoja(libro, ["Estanterias", "Estantería", "Estanterías"]) ?? [];
  for (const e of hojaEst) {
    const H = "Estanterias";
    const codigo = e.datos.codigo?.trim() || e.datos.nombre?.trim() || "";
    if (!codigo) fallar(`${H}, fila ${e.n}: falta el código.`);
    const modelo = e.datos.modelo?.trim() ?? "";
    const familia = e.datos.familia?.trim() ?? "";
    if (!conoceModelo(modelo)) fallar(`${H}, fila ${e.n}: el modelo "${modelo}" no existe.`);
    if (!conoceFamilia(familia)) fallar(`${H}, fila ${e.n}: la familia "${familia}" no existe.`);
    const moldes = aEntero(e.datos.moldes ?? "", "moldes", e.n, H);
    if (moldes === null || moldes < 1) {
      fallar(`${H}, fila ${e.n}: cargá cuántos moldes tiene la estantería.`);
    }
    const activa = aBooleano(e.datos.activo ?? "", true);

    const ya = estPorCodigo.get(normalizar(codigo));
    const cambia = !!ya && (ya.moldes !== moldes || ya.activa !== activa);

    plan.estanterias.push({
      codigo,
      modelo,
      familia,
      moldes,
      activa,
      idExistente: ya?.id ?? null,
      cambia,
    });
    filas.push({
      hoja: H,
      fila: e.n,
      accion: !ya ? "crear" : cambia ? "actualizar" : "sin cambios",
      descripcion: codigo,
      detalle: `${modelo} · ${familia} · ${moldes} moldes`,
    });
  }

  if (!filas.length) {
    fallar(
      "El archivo no tiene ninguna hoja reconocible. Tienen que llamarse " +
        "Familias, Modelos, Productos o Estanterias.",
    );
  }

  const analisis: Analisis = {
    filas,
    crear: filas.filter((f) => f.accion === "crear").length,
    actualizar: filas.filter((f) => f.accion === "actualizar").length,
    sinCambios: filas.filter((f) => f.accion === "sin cambios").length,
    errores: filas.filter((f) => f.accion === "error").length,
  };
  return { plan, analisis };
}

/* -------------------------------------------------------------------------- */
/* Acciones                                                                   */
/* -------------------------------------------------------------------------- */

export async function analizarPlanilla(fd: FormData): Promise<Resultado<Analisis>> {
  return ejecutar(async () => {
    await autorizar();
    const archivo = fd.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      fallar("Elegí un archivo .xlsx.");
    }
    const { analisis } = await construirPlan(await archivo.arrayBuffer());
    return analisis;
  });
}

export async function importarPlanilla(fd: FormData): Promise<Resultado<Analisis>> {
  return ejecutar(async () => {
    await autorizar();
    const archivo = fd.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      fallar("Elegí un archivo .xlsx.");
    }
    // Se vuelve a analizar el archivo en vez de confiar en el analisis previo:
    // entre la vista previa y el OK pudo cambiar la base, y aplicar un plan
    // viejo escribiria algo distinto de lo que se le mostro al usuario.
    const { plan, analisis } = await construirPlan(await archivo.arrayBuffer());

    await db.transaction(async (tx) => {
      const fam = new Map(
        (await tx.select().from(familias)).map((f) => [normalizar(f.nombre), f.id]),
      );
      for (const f of plan.familias) {
        const k = normalizar(f.nombre);
        if (!fam.has(k)) {
          const [n] = await tx
            .insert(familias)
            .values({ nombre: f.nombre, orden: f.orden ?? 0 })
            .returning();
          fam.set(k, n.id);
        } else if (f.orden !== null) {
          await tx.update(familias).set({ orden: f.orden }).where(eq(familias.id, fam.get(k)!));
        }
      }

      const mod = new Map(
        (await tx.select().from(modelos)).map((m) => [normalizar(m.nombre), m.id]),
      );
      for (const m of plan.modelos) {
        const k = normalizar(m.nombre);
        if (!mod.has(k)) {
          const [n] = await tx
            .insert(modelos)
            .values({ nombre: m.nombre, orden: m.orden ?? 0 })
            .returning();
          mod.set(k, n.id);
        } else if (m.orden !== null) {
          await tx.update(modelos).set({ orden: m.orden }).where(eq(modelos.id, mod.get(k)!));
        }
      }

      for (const p of plan.productos) {
        const valores = {
          nombre: p.nombre,
          modeloId: mod.get(normalizar(p.modelo))!,
          familiaId: fam.get(normalizar(p.familia))!,
          piezasPorMolde: p.piezasPorMolde,
          piezasPorPaquete: p.piezasPorPaquete,
          requiereTunel: p.requiereTunel,
          m2PorPaquete: p.m2PorPaquete,
          activo: p.activo,
        };
        if (p.idExistente) {
          await tx.update(productos).set(valores).where(eq(productos.id, p.idExistente));
        } else {
          await tx.insert(productos).values(valores);
        }
      }

      for (const e of plan.estanterias) {
        const valores = {
          codigo: e.codigo,
          modeloId: mod.get(normalizar(e.modelo))!,
          familiaId: fam.get(normalizar(e.familia))!,
          moldes: e.moldes,
          activa: e.activa,
        };
        if (e.idExistente) {
          await tx.update(estanterias).set(valores).where(eq(estanterias.id, e.idExistente));
        } else {
          await tx.insert(estanterias).values(valores);
        }
      }
    });

    revalidatePath("/admin", "layout");
    revalidatePath("/trompo");
    revalidatePath("/tablero");
    return analisis;
  });
}
