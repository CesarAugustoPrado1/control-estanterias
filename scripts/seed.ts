/**
 * Datos iniciales. Idempotente en los maestros: volver a correrlo no duplica
 * nada, pero tampoco pisa lo que ya este cargado.
 *
 *   npm run db:seed                     maestros + produccion simulada
 *   npm run db:seed -- --solo-maestros  sin tandas
 *
 * Sobre la simulacion: en vez de inventar estados sueltos, genera la LINEA DE
 * TIEMPO COMPLETA de cada tanda (llenado, patio, horno, desmolde, empaque) y
 * despues aplica unicamente los movimientos cuya fecha ya paso. El estado actual
 * de cada tanda es el del ultimo movimiento aplicado.
 *
 * Eso da gratis una foto realista del piso -tandas repartidas en todos los
 * estados, con antiguedades coherentes- en lugar de una poblacion inventada a
 * mano que despues no cierra con su propio historial.
 *
 * La asignacion de estanterias respeta la restriccion real: una estanteria esta
 * ocupada desde el llenado hasta el desmolde. Si no hay ninguna libre del
 * modelo+familia que toca, esa tanda no se genera. Es exactamente el cuello de
 * botella de la planta, asi que la simulacion lo reproduce en vez de ignorarlo.
 */
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, despertar } from "./_db";
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
  type Estado,
  type MotivoFraguado,
  type Rol,
  type TipoMovimiento,
  type Trompo,
} from "../lib/db/schema";

/* -------------------------------------------------------------------------- */
/* Datos inventados                                                           */
/* -------------------------------------------------------------------------- */

const FAMILIAS = [
  "Gris — cemento gris",
  "Negro — cemento gris",
  "Rojo — cemento gris",
  "Beige — cemento blanco",
];

const MODELOS = ["Kamba", "Uhma", "Laja Serrana", "Ladrillo Colonial"];

/**
 * Los tres casos de conversion del negocio estan representados a proposito, y
 * las cantidades de molde estan elegidas para que toda estanteria de ~10 m2:
 *
 *   Kamba    40 moldes x 1 paq x 0,26 = 10,4 m2
 *   Uhma     40 moldes / 2 x 0,50     = 10,0 m2   (dos moldes un paquete)
 *   Laja     30 moldes x 1 x 0,33     =  9,9 m2
 *   Ladrillo 40 moldes x 2 x 0,12     =  9,6 m2   (un molde dos piezas, sin tunel)
 */
const PRODUCTOS: {
  nombre: string;
  modelo: string;
  familia: string;
  ppm: number;
  ppp: number;
  tunel: boolean;
  m2: string;
  peso: number;
}[] = [
  { nombre: "Kamba Gris Perla", modelo: "Kamba", familia: FAMILIAS[0], ppm: 1, ppp: 1, tunel: true, m2: "0.2600", peso: 10 },
  { nombre: "Kamba Gris Basalto", modelo: "Kamba", familia: FAMILIAS[0], ppm: 1, ppp: 1, tunel: true, m2: "0.2600", peso: 7 },
  { nombre: "Kamba Negro Volcan", modelo: "Kamba", familia: FAMILIAS[1], ppm: 1, ppp: 1, tunel: true, m2: "0.2600", peso: 4 },
  { nombre: "Uhma Beige Arena", modelo: "Uhma", familia: FAMILIAS[3], ppm: 1, ppp: 2, tunel: true, m2: "0.5000", peso: 8 },
  { nombre: "Uhma Beige Trigo", modelo: "Uhma", familia: FAMILIAS[3], ppm: 1, ppp: 2, tunel: true, m2: "0.5000", peso: 5 },
  { nombre: "Laja Serrana Gris", modelo: "Laja Serrana", familia: FAMILIAS[0], ppm: 1, ppp: 1, tunel: true, m2: "0.3300", peso: 6 },
  { nombre: "Laja Serrana Beige", modelo: "Laja Serrana", familia: FAMILIAS[3], ppm: 1, ppp: 1, tunel: true, m2: "0.3300", peso: 4 },
  { nombre: "Ladrillo Colonial Rojo", modelo: "Ladrillo Colonial", familia: FAMILIAS[2], ppm: 2, ppp: 1, tunel: false, m2: "0.1200", peso: 6 },
];

/** Cuantas estanterias hay de cada par modelo+familia, y con cuantos moldes. */
const ESTANTERIAS: { modelo: string; familia: string; cantidad: number; moldes: number }[] = [
  { modelo: "Kamba", familia: FAMILIAS[0], cantidad: 14, moldes: 40 },
  { modelo: "Kamba", familia: FAMILIAS[1], cantidad: 6, moldes: 40 },
  { modelo: "Uhma", familia: FAMILIAS[3], cantidad: 12, moldes: 40 },
  { modelo: "Laja Serrana", familia: FAMILIAS[0], cantidad: 8, moldes: 30 },
  { modelo: "Laja Serrana", familia: FAMILIAS[3], cantidad: 6, moldes: 30 },
  { modelo: "Ladrillo Colonial", familia: FAMILIAS[2], cantidad: 10, moldes: 40 },
];

const MOTIVOS = [
  "Rotura en desmolde",
  "Fisura por fraguado",
  "Mal llenado / falta de material",
  "Golpe en manipuleo",
  "Diferencia de color",
  "Molde deteriorado",
];

const USUARIOS: { usuario: string; nombre: string; rol: Rol }[] = [
  { usuario: "admin", nombre: "Administrador", rol: "admin" },
  { usuario: "marcelo", nombre: "Marcelo Ruiz", rol: "trompo" },
  { usuario: "andrea", nombre: "Andrea Sosa", rol: "trompo" },
  { usuario: "ruben", nombre: "Ruben Diaz", rol: "horno" },
  { usuario: "gustavo", nombre: "Gustavo Leiva", rol: "desmolde" },
  { usuario: "nadia", nombre: "Nadia Ferreyra", rol: "desmolde" },
  { usuario: "silvia", nombre: "Silvia Molina", rol: "empaque" },
  { usuario: "oficina", nombre: "Oficina", rol: "oficina" },
  { usuario: "auditor", nombre: "Auditoria", rol: "auditor" },
];

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                 */
/* -------------------------------------------------------------------------- */

/** Random con semilla: dos corridas del seed dan los mismos datos. */
let semilla = 20260915;
function rnd(): number {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
}
const entre = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const hs = (h: number) => h * 3600_000;

function elegirPesado<T extends { peso: number }>(items: T[]): T {
  const total = items.reduce((a, i) => a + i.peso, 0);
  let r = rnd() * total;
  for (const i of items) if ((r -= i.peso) <= 0) return i;
  return items[items.length - 1];
}

/* -------------------------------------------------------------------------- */
/* Maestros                                                                   */
/* -------------------------------------------------------------------------- */

async function cargarMaestros() {
  // Una consulta por tabla y un insert masivo por tabla. La version anterior
  // consultaba fila por fila -unos 80 viajes- y la conexion se cortaba a mitad
  // de camino con `Connection terminated unexpectedly`.
  const abrev = (s: string) => s.split(" ")[0].slice(0, 3).toUpperCase();

  const f = new Map<string, number>(
    (await db.select().from(familias)).map((x) => [x.nombre, x.id]),
  );
  const faltanF = FAMILIAS.map((nombre, orden) => ({ nombre, orden })).filter(
    (x) => !f.has(x.nombre),
  );
  if (faltanF.length) {
    for (const n of await db.insert(familias).values(faltanF).returning())
      f.set(n.nombre, n.id);
  }

  const m = new Map<string, number>(
    (await db.select().from(modelos)).map((x) => [x.nombre, x.id]),
  );
  const faltanM = MODELOS.map((nombre, orden) => ({ nombre, orden })).filter(
    (x) => !m.has(x.nombre),
  );
  if (faltanM.length) {
    for (const n of await db.insert(modelos).values(faltanM).returning())
      m.set(n.nombre, n.id);
  }

  const p = new Map<string, number>(
    (await db.select().from(productos)).map((x) => [x.nombre, x.id]),
  );
  const faltanP = PRODUCTOS.filter((d) => !p.has(d.nombre)).map((d) => ({
    nombre: d.nombre,
    modeloId: m.get(d.modelo)!,
    familiaId: f.get(d.familia)!,
    piezasPorMolde: d.ppm,
    piezasPorPaquete: d.ppp,
    requiereTunel: d.tunel,
    m2PorPaquete: d.m2,
  }));
  if (faltanP.length) {
    for (const n of await db.insert(productos).values(faltanP).returning())
      p.set(n.nombre, n.id);
  }

  const porCodigo = new Map(
    (await db.select().from(estanterias)).map((e) => [e.codigo, e]),
  );
  const faltanE: (typeof estanterias.$inferInsert)[] = [];
  for (const g of ESTANTERIAS) {
    for (let i = 1; i <= g.cantidad; i++) {
      const codigo = `${abrev(g.modelo)}-${abrev(g.familia)}-${String(i).padStart(2, "0")}`;
      if (porCodigo.has(codigo)) continue;
      faltanE.push({
        codigo,
        modeloId: m.get(g.modelo)!,
        familiaId: f.get(g.familia)!,
        // Variacion real: estanterias del mismo producto no tienen exactamente
        // la misma cantidad de moldes.
        moldes: g.moldes + entre(-2, 1),
      });
    }
  }
  if (faltanE.length) {
    for (const n of await db.insert(estanterias).values(faltanE).returning())
      porCodigo.set(n.codigo, n);
  }

  const motYa = new Set(
    (await db.select().from(motivosRotura)).map((x) => x.nombre),
  );
  const faltanMot = MOTIVOS.filter((n) => !motYa.has(n)).map((nombre) => ({
    nombre,
  }));
  if (faltanMot.length) await db.insert(motivosRotura).values(faltanMot);

  const userYa = new Set(
    (await db.select().from(usuarios)).map((x) => x.usuario),
  );
  const faltanU = USUARIOS.filter((u) => !userYa.has(u.usuario));
  if (faltanU.length) {
    const hash = await bcrypt.hash(process.env.ADMIN_PIN ?? "1234", 10);
    await db
      .insert(usuarios)
      .values(faltanU.map((u) => ({ ...u, pinHash: hash })));
  }

  await db
    .insert(config)
    .values({ clave: "capacidad_horno", valor: "18" })
    .onConflictDoNothing();

  return { f, m, p, estanterias: [...porCodigo.values()] };
}

/* -------------------------------------------------------------------------- */
/* Produccion simulada                                                        */
/* -------------------------------------------------------------------------- */

type Paso = {
  cuando: Date;
  tipo: TipoMovimiento;
  desde: Estado | null;
  hasta: Estado;
  rol: Rol;
  trompo?: Trompo;
  moldes?: number;
  paquetes?: number;
  motivo?: MotivoFraguado;
};

const DIAS = 14;

type Maestros = Awaited<ReturnType<typeof cargarMaestros>>;

async function simular(maestros: Maestros) {
  const users = await db.select().from(usuarios);
  const porRol = (r: Rol) => {
    const c = users.filter((u) => u.rol === r);
    return c[entre(0, c.length - 1)];
  };
  const mots = await db.select().from(motivosRotura);
  const prods = await db.select().from(productos);
  const prodPorNombre = new Map(prods.map((p) => [p.nombre, p]));
  const modPorId = new Map((await db.select().from(modelos)).map((x) => [x.id, x.nombre]));
  const famPorId = new Map((await db.select().from(familias)).map((x) => [x.id, x.nombre]));

  /** Cuando se libera cada estanteria. Arranca libre. */
  const libreDesde = new Map<number, number>(
    maestros.estanterias.map((e) => [e.id, 0]),
  );

  const ahora = Date.now();
  const inicio = ahora - hs(24 * DIAS);
  let correlativo = 0;

  const filasTanda: (typeof tandas.$inferInsert)[] = [];
  const pasosPorTanda: Paso[][] = [];

  for (let d = 0; d < DIAS; d++) {
    const base = inicio + hs(24 * d);
    // Los datos de prueba producen todos los dias, tambien fin de semana. No es
    // realista y es a proposito: con un domingo sin produccion dentro de las
    // ultimas 72 horas, la foto del piso queda con estados enteros vacios -el
    // horno sobre todo- y justo esas son las pantallas que hay que probar.

    for (let k = 0; k < 16; k++) {
      const trompo: Trompo = k < 11 ? "a" : "b";
      // Turno unico: llenados entre las 7 y las 18.
      const llenado = base + hs(7) + hs(k * 0.7) + entre(-15, 15) * 60_000;
      if (llenado > ahora) continue;

      const def = elegirPesado(PRODUCTOS);
      const prod = prodPorNombre.get(def.nombre)!;

      // Buscar una estanteria de ese modelo+familia libre a esa hora.
      const candidatas = maestros.estanterias.filter(
        (e) =>
          e.modeloId === prod.modeloId &&
          e.familiaId === prod.familiaId &&
          (libreDesde.get(e.id) ?? 0) <= llenado,
      );
      if (!candidatas.length) continue; // sin moldes libres: no se llena. Pasa en serio.
      const est = candidatas[entre(0, candidatas.length - 1)];

      // Casi siempre falta un poco de mezcla para el ultimo molde.
      const moldesLlenados = est.moldes - (rnd() < 0.62 ? entre(1, 2) : 0);

      const pasos: Paso[] = [];
      pasos.push({
        cuando: new Date(llenado),
        tipo: "llenado",
        desde: null,
        hasta: "patio",
        rol: "trompo",
        trompo,
        moldes: moldesLlenados,
      });

      const saltaHorno = rnd() < 0.12;
      let tDesmoldar: number;

      if (saltaHorno) {
        const motivo: MotivoFraguado = rnd() < 0.7 ? "horno_lleno" : "clima";
        tDesmoldar = llenado + hs(entre(44, 70));
        pasos.push({
          cuando: new Date(tDesmoldar),
          tipo: "fraguado_natural",
          desde: "patio",
          hasta: "a_desmoldar",
          rol: "horno",
          motivo,
        });
      } else {
        const tHorno = llenado + hs(entre(18, 30));
        pasos.push({
          cuando: new Date(tHorno),
          tipo: "entrada_horno",
          desde: "patio",
          hasta: "horno",
          rol: "horno",
        });
        let tSalida = tHorno + hs(entre(16, 26));
        pasos.push({
          cuando: new Date(tSalida),
          tipo: "salida_horno",
          desde: "horno",
          hasta: "a_desmoldar",
          rol: "horno",
        });

        // A veces no fraguo bien y vuelve a la cola del horno.
        if (rnd() < 0.06) {
          const tDev = tSalida + hs(entre(1, 6));
          pasos.push({
            cuando: new Date(tDev),
            tipo: "devolucion_horno",
            desde: "a_desmoldar",
            hasta: "patio",
            rol: "desmolde",
          });
          const tRe = tDev + hs(entre(1, 8));
          pasos.push({
            cuando: new Date(tRe),
            tipo: "entrada_horno",
            desde: "patio",
            hasta: "horno",
            rol: "horno",
          });
          tSalida = tRe + hs(entre(8, 14));
          pasos.push({
            cuando: new Date(tSalida),
            tipo: "salida_horno",
            desde: "horno",
            hasta: "a_desmoldar",
            rol: "horno",
          });
        }
        tDesmoldar = tSalida;
      }

      const tDesmolde = tDesmoldar + hs(entre(2, 26));
      pasos.push({
        cuando: new Date(tDesmolde),
        tipo: "desmolde",
        desde: "a_desmoldar",
        hasta: "a_empaquetar",
        rol: "desmolde",
      });

      // El tramo que motivo la app: a veces el mismo dia, a veces no.
      const tEmpaque = tDesmolde + (rnd() < 0.55 ? hs(entre(1, 7)) : hs(entre(20, 46)));
      const piezas = moldesLlenados * prod.piezasPorMolde;
      const esperados = Math.floor(piezas / prod.piezasPorPaquete);
      const rotas = rnd() < 0.25 ? entre(1, 3) : 0;
      pasos.push({
        cuando: new Date(tEmpaque),
        tipo: "empaquetado",
        desde: "a_empaquetar",
        hasta: "listo",
        rol: "empaque",
        paquetes: Math.max(0, esperados - rotas),
      });

      // La estanteria queda ocupada hasta el desmolde, no hasta el empaque.
      libreDesde.set(est.id, tDesmolde);

      correlativo++;
      const codigo = `E-${String(correlativo).padStart(5, "0")}`;
      const aplicados = pasos.filter((p) => p.cuando.getTime() <= ahora);
      const ultimo = aplicados[aplicados.length - 1];
      const desmoldada = aplicados.some((p) => p.tipo === "desmolde");
      const cerrada = ultimo.hasta === "listo";
      const motivoRot = rotas > 0 && cerrada ? mots[entre(0, mots.length - 1)] : null;

      filasTanda.push({
        codigo,
        estanteriaId: est.id,
        productoId: prod.id,
        productoNombre: prod.nombre,
        modeloNombre: modPorId.get(prod.modeloId)!,
        familiaNombre: famPorId.get(prod.familiaId)!,
        piezasPorMolde: prod.piezasPorMolde,
        piezasPorPaquete: prod.piezasPorPaquete,
        m2PorPaquete: prod.m2PorPaquete,
        trompo,
        moldesNominal: est.moldes,
        moldesLlenados,
        paquetes: cerrada ? Math.max(0, esperados - rotas) : null,
        motivoRoturaId: motivoRot?.id ?? null,
        motivoRoturaNombre: motivoRot?.nombre ?? null,
        estado: ultimo.hasta,
        estadoDesde: ultimo.cuando,
        estanteriaLiberadaEn: desmoldada
          ? aplicados.find((p) => p.tipo === "desmolde")!.cuando
          : null,
        rehornear: false,
        creadaEn: new Date(llenado),
      });
      pasosPorTanda.push(aplicados);
    }
  }

  const insertadas: { id: number; codigo: string }[] = [];
  for (let i = 0; i < filasTanda.length; i += 200) {
    const r = await db
      .insert(tandas)
      .values(filasTanda.slice(i, i + 200))
      .returning({ id: tandas.id, codigo: tandas.codigo });
    insertadas.push(...r);
  }

  const filasMov: (typeof movimientos.$inferInsert)[] = [];
  for (const [i, pasos] of pasosPorTanda.entries()) {
    const t = insertadas[i];
    const f = filasTanda[i];
    let anterior = f.creadaEn as Date;
    for (const p of pasos) {
      const u = porRol(p.rol);
      filasMov.push({
        tandaId: t.id,
        tandaCodigo: t.codigo,
        productoNombre: f.productoNombre,
        tipo: p.tipo,
        estadoDesde: p.desde,
        estadoHasta: p.hasta,
        usuarioId: u.id,
        usuarioNombre: u.nombre,
        // Cuanto duro el estado ANTERIOR. Calculado al escribir, como en runtime.
        duracionMin:
          p.tipo === "llenado"
            ? null
            : Math.round((p.cuando.getTime() - anterior.getTime()) / 60000),
        trompo: p.trompo ?? null,
        moldesLlenados: p.moldes ?? null,
        paquetes: p.paquetes ?? null,
        motivoFraguado: p.motivo ?? null,
        creadoEn: p.cuando,
      });
      anterior = p.cuando;
    }
  }
  for (let i = 0; i < filasMov.length; i += 400) {
    await db.insert(movimientos).values(filasMov.slice(i, i + 400));
  }

  return { tandas: insertadas.length, movimientos: filasMov.length };
}

/* -------------------------------------------------------------------------- */

async function main() {
  await despertar();
  const soloMaestros = process.argv.includes("--solo-maestros");

  console.log("\nCargando maestros...");
  const m = await cargarMaestros();
  console.log(
    `  ${FAMILIAS.length} familias, ${MODELOS.length} modelos, ` +
      `${PRODUCTOS.length} productos, ${m.estanterias.length} estanterias, ` +
      `${USUARIOS.length} usuarios`,
  );

  if (!soloMaestros) {
    const hay = await db.select({ n: sql<number>`count(*)::int` }).from(tandas);
    if (Number(hay[0].n) > 0) {
      console.log(
        `\nYa hay ${hay[0].n} tandas cargadas: no se simula de nuevo.\n` +
          "Para regenerar: npm run db:limpiar -- --movimientos && npm run db:seed\n",
      );
    } else {
      console.log("\nSimulando produccion...");
      const r = await simular(m);
      console.log(`  ${r.tandas} tandas, ${r.movimientos} movimientos`);
    }
  }

  const foto = await db
    .select({ estado: tandas.estado, n: sql<number>`count(*)::int` })
    .from(tandas)
    .groupBy(tandas.estado);
  if (foto.length) {
    console.log("\nFoto del piso:");
    for (const f of foto) console.log(`  ${f.estado.padEnd(14)} ${f.n}`);
  }

  console.log(`\nUsuario admin / PIN ${process.env.ADMIN_PIN ?? "1234"}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
