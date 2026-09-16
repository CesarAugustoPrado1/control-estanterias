"use server";

import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { autorizar } from "../auth";
import { db } from "../db";
import { estanterias, familias, modelos, productos, type Cemento } from "../db/schema";
import { codigoEstanteria, etiquetaPlaca } from "../tarjetas";
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
  cemento: "cemento",
  "tipo de cemento": "cemento",
  numero: "numero",
  nro: "numero",
  placa: "numero",
  "numero de placa": "numero",
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

/** Vacio es gris: es el caso normal, y el blanco se hace a pedido. */
function aCemento(v: string, fila: number, hoja: string): Cemento {
  const n = normalizar(v);
  if (n === "" || n === "gris" || n === "g" || n === "cemento gris") return "gris";
  if (n === "blanco" || n === "b" || n === "cemento blanco") return "blanco";
  fallar(`${hoja}, fila ${fila}: "cemento" tiene que ser gris o blanco, y dice "${v}".`);
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
    cemento: Cemento;
    m2PorPaquete: string | null;
    activo: boolean;
    idExistente: number | null;
    cambia: boolean;
  }[];
  estanterias: {
    codigo: string;
    modelo: string;
    familia: string;
    cemento: Cemento;
    numero: number;
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
    const cemento = aCemento(p.datos.cemento ?? "", p.n, H);
    const activo = aBooleano(p.datos.activo ?? "", true);

    const ya = prodPorNombre.get(normalizar(nombre));
    const cambia =
      !!ya &&
      (ya.piezasPorMolde !== ppm ||
        ya.cemento !== cemento ||
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
      cemento,
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
      detalle: `cemento ${cemento} · ${ppm} pieza(s)/molde · ${ppp} pieza(s)/paquete · ${tunel ? "con túnel" : "sin túnel"}${m2 ? ` · ${m2} m²` : ""}`,
    });
  }

  // --- Estanterias
  //
  // Se identifican por la placa (modelo + familia + numero), o por codigo si la
  // planilla lo trae. Sin numero, se asigna el siguiente libre de ese modelo y
  // familia: la planilla es tolerante con lo que falta y estricta con lo que
  // esta mal.
  //
  // Lo que NO se hace desde la planilla: cambiar la familia o el cemento de una
  // estanteria que ya existe. Es una reasignacion (§10.6): exige motivo y la
  // estanteria vacia, y una planilla no puede dar ninguna de las dos cosas.
  const nombreModelo = new Map(modBase.map((m) => [m.id, normalizar(m.nombre)]));
  const nombreFamilia = new Map(famBase.map((f) => [f.id, normalizar(f.nombre)]));
  const claveGrupo = (modelo: string, familia: string) => `${normalizar(modelo)}|${normalizar(familia)}`;
  const placasUsadas = new Map<string, number>(); // "grupo|numero" -> id existente (0 = nueva)
  const maxNumero = new Map<string, number>();
  for (const e of estBase) {
    const g = `${nombreModelo.get(e.modeloId)}|${nombreFamilia.get(e.familiaId)}`;
    if (e.numero !== null) {
      placasUsadas.set(`${g}|${e.numero}`, e.id);
      maxNumero.set(g, Math.max(maxNumero.get(g) ?? 0, e.numero));
    }
  }

  const hojaEst = leerHoja(libro, ["Estanterias", "Estantería", "Estanterías"]) ?? [];
  for (const e of hojaEst) {
    const H = "Estanterias";
    const modelo = e.datos.modelo?.trim() ?? "";
    const familia = e.datos.familia?.trim() ?? "";
    if (!conoceModelo(modelo)) fallar(`${H}, fila ${e.n}: el modelo "${modelo}" no existe.`);
    if (!conoceFamilia(familia)) fallar(`${H}, fila ${e.n}: la familia "${familia}" no existe.`);
    const moldes = aEntero(e.datos.moldes ?? "", "moldes", e.n, H);
    if (moldes === null || moldes < 1) {
      fallar(`${H}, fila ${e.n}: cargá cuántos moldes tiene la estantería.`);
    }
    const cemento = aCemento(e.datos.cemento ?? "", e.n, H);
    const activa = aBooleano(e.datos.activo ?? "", true);
    const g = claveGrupo(modelo, familia);

    let numero = aEntero(e.datos.numero ?? "", "numero", e.n, H);
    const numeroAsignado = numero === null;
    if (numero !== null && numero < 1) fallar(`${H}, fila ${e.n}: el número de placa empieza en 1.`);

    const codigoPlanilla = e.datos.codigo?.trim() || null;
    let ya = codigoPlanilla ? estPorCodigo.get(normalizar(codigoPlanilla)) : undefined;
    if (!ya && numero !== null) {
      const id = placasUsadas.get(`${g}|${numero}`);
      ya = id ? estBase.find((x) => x.id === id) : undefined;
    }
    if (numero === null) {
      numero = ya?.numero ?? (maxNumero.get(g) ?? 0) + 1;
    }

    if (ya) {
      const g0 = `${nombreModelo.get(ya.modeloId)}|${nombreFamilia.get(ya.familiaId)}`;
      if (g0 !== g || ya.cemento !== cemento) {
        fallar(
          `${H}, fila ${e.n}: la estantería ${ya.codigo} cambiaría de ${g0 !== g ? "modelo o familia" : "cemento"}. ` +
            `Eso es una reasignación: se hace desde Admin → Estanterías, con motivo y con la estantería vacía.`,
        );
      }
    }

    const clavePlaca = `${g}|${numero}`;
    const duenio = placasUsadas.get(clavePlaca);
    if (duenio !== undefined && duenio !== (ya?.id ?? -1)) {
      fallar(
        `${H}, fila ${e.n}: ya hay otra estantería ${modelo.toUpperCase()} · ${familia.toUpperCase()} · ` +
          `${String(numero).padStart(2, "0")}. El número de placa no se puede repetir.`,
      );
    }
    placasUsadas.set(clavePlaca, ya?.id ?? 0);
    maxNumero.set(g, Math.max(maxNumero.get(g) ?? 0, numero));

    const codigo = codigoPlanilla ?? ya?.codigo ?? codigoEstanteria(modelo, familia, numero);
    const cambia =
      !!ya && (ya.moldes !== moldes || ya.activa !== activa || ya.numero !== numero || ya.codigo !== codigo);

    plan.estanterias.push({
      codigo,
      modelo,
      familia,
      cemento,
      numero,
      moldes,
      activa,
      idExistente: ya?.id ?? null,
      cambia,
    });
    filas.push({
      hoja: H,
      fila: e.n,
      accion: !ya ? "crear" : cambia ? "actualizar" : "sin cambios",
      descripcion: etiquetaPlaca(modelo, familia, numero),
      detalle:
        `${moldes} moldes · cemento ${cemento}` + (numeroAsignado && !ya ? " · número asignado automáticamente" : ""),
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
          cemento: p.cemento,
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
          cemento: e.cemento,
          numero: e.numero,
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
