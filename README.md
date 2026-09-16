# Control de Estanterías

App web para el seguimiento de estanterías de revestimientos cementicios:
**trompo → patio → horno → desmolde → empaque**, con la rotura calculada y no
cargada.

Pensada para que el trompo, el hornero, desmolde y empaque trabajen desde el
celular en planta, y que oficina y auditoría miren todo desde la PC.

El razonamiento detrás de cada decisión está en [ARQUITECTURA.md](ARQUITECTURA.md).
Las secciones de *trampas* valen más que las de estructura.

---

## El circuito

```
   ┌── la tanda RETIENE la estantería ───────┐
   │                                          │   ya no la retiene
   ▼                                          ▼
 patio ──▶ horno ──▶ a desmoldar ──DESMOLDE──▶ a empaquetar ──▶ listo
   │  ▲                   │
   │  └── devolución ──────┘
   └──── fraguado natural ─────▶ a desmoldar
```

| Estado | Quién lo mueve | Qué pasa |
| --- | --- | --- |
| **patio** | Trompo | Se llenó la estantería y fragua a la intemperie |
| **horno** | Hornero | Entran hasta 18 tandas. Suelen estar 24 hs o menos |
| **a desmoldar** | Hornero | Salió del horno y espera turno |
| **a empaquetar** | Desmolde | Se separaron moldes y piezas. **La estantería queda libre** |
| **listo** | Empaque | Se contaron los paquetes. Listo para entregar |

**Una tanda es un ciclo**, con código correlativo que no se reusa nunca. Ese
código es el que va escrito en la tarjeta colgada del soporte, y es lo que
permite distinguir dos tandas del mismo producto en el patio.

**El desmolde libera la estantería pero no termina la tanda.** La estantería
vuelve al trompo el mismo día mientras las piezas todavía esperan el túnel: por
eso son un solo registro y no dos entidades.

---

## Las reglas que el sistema hace cumplir

- Una **estantería es un grupo fijo de moldes**, no un carro. Está atada a un
  modelo y a una familia de color, y solo se puede llenar con productos de ese
  par. Está libre cuando no tiene ninguna tanda en patio, horno o a desmoldar —
  es una consulta, no un estado que haya que mantener.
- **La rotura se calcula**, no se carga: es la diferencia entre lo que llenó el
  trompo y lo que contó el empaque. Nunca se atribuye al empaquetador — el
  empaque no la genera, solo la evidencia.
- **Todas las tandas pasan por empaque**, incluso las de productos que no van al
  túnel: es el único punto de conteo del sistema.
- El **fraguado natural exige motivo**: por horno lleno es capacidad perdida, por
  clima es ahorro. Son opuestos y promediarlos da un número inútil.
- Si dos personas tocan la misma tanda a la vez, la segunda recibe un aviso
  claro en lugar de pisar el movimiento de la primera.
- **Nada se borra.** Productos y estanterías se dan de baja; los errores se
  arreglan con una corrección de admin, que exige nota.

---

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completar con las cadenas de Neon
npm run db:migrar            # crea el esquema y las tablas (nunca db:push: ver ARQUITECTURA §9.5)
npm run db:palabras          # carga las tarjetas desde datos/palabras.json
npm run db:seed              # maestros + producción simulada
npm run dev
```

Entrar con **admin** y el PIN de `ADMIN_PIN` (1234 por defecto). Cambialo desde
el panel apenas entres.

## Comandos

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run db:migrar` | Aplica las migraciones SQL pendientes de `migraciones/` |
| `npm run db:migrar -- --ver` | Muestra cuáles están pendientes, sin aplicar |
| `npm run db:palabras` | Carga o actualiza las tarjetas desde `datos/palabras.json`. Nunca borra |
| `python scripts/verificar-palabras.py` | Verifica las reglas de la lista de palabras |
| `npx tsx scripts/palabras-excel.ts` | Genera la planilla de revisión de palabras |
| `npm run db:studio` | Explorador de datos |
| `npm run db:seed` | Maestros inventados + 14 días de producción simulada |
| `npm run db:seed -- --solo-maestros` | Sin tandas |
| `npm run db:limpiar` | Muestra qué hay en cada tabla. **No toca nada** |
| `npm run db:limpiar -- --movimientos` | Borra tandas e historial |
| `npm run db:limpiar -- --todo` | Además borra los maestros |
| `npm run db:limpiar -- --todo --conservar-usuarios` | Igual, sin tocar usuarios. Las tarjetas no se borran nunca |
| `npx tsx scripts/plantilla.ts` | Genera `plantilla-datos.xlsx` para la carga masiva |

El borrado usa `TRUNCATE ... RESTART IDENTITY`: arrancar de cero es de cero
también en los números de tanda.

## Variables de entorno

| Variable | Qué es |
| --- | --- |
| `DATABASE_URL` | Neon, cadena **pooled** (el host lleva `-pooler`). La usa la app |
| `DIRECT_URL` | Neon, cadena **directa**. La usan drizzle-kit y los scripts |
| `SESSION_SECRET` | Clave para firmar las cookies de sesión |
| `ADMIN_PIN` | PIN inicial del admin. Solo lo usa el seed |

---

## Carga de datos reales

Desde **Admin → Planilla Excel**, o a mano desde el panel. El import es de dos
pasos: primero muestra fila por fila qué va a pasar, después lo aplica en una
transacción. **La planilla nunca borra** y **o entra todo o no entra nada**.

`npx tsx scripts/plantilla.ts` genera un archivo con el formato exacto y las
notas de cada columna.

## Backup

El export a Excel de Admin **no es un backup**: es una copia legible. El backup
de verdad es un `pg_dump` programado contra Neon. Ver §9.4 de
[ARQUITECTURA.md](ARQUITECTURA.md).
