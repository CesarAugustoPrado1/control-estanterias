# Control de Estanterías — documento de arquitectura

Registro de **qué resuelve esta app, cómo está armada y por qué se tomó cada
decisión**. Las secciones de *trampas* y *decisiones* valen más que las de
estructura: la estructura se deduce del código, las razones no.

Hermana de **Control-Secaderos**: mismo criterio de diseño y mismo stack, pero
**base de datos separada** y ni una tabla en común. Lo que cambia respecto de esa
app está marcado.

---

## 1. Qué resuelve

Una fábrica de revestimientos cementicios. Se prepara un pastón de mortero en un
trompo y con él se llenan los moldes de una **estantería**. La estantería fragua
en el patio, entra al horno, sale, se desmolda —los moldes vuelven a producción,
las piezas van a un palet— y finalmente las piezas se empaquetan en un túnel
termocontraíble y quedan listas para entregar.

El ciclo completo tarda **unas 72 horas**, sin tiempos fijos: se llena un lunes y
se desmolda y empaqueta el miércoles, más o menos. Ese *más o menos* es el
problema. En particular, **el empaquetado a veces se hace el mismo día del
desmolde y a veces no**, y hoy nadie sabe cuánto hay parado esperando ni desde
cuándo.

El sistema responde: dónde está cada tanda y hace cuánto, cuántos moldes libres
hay de cada modelo, cuánto tarda el horno de verdad, cuánto se rompe y dónde se
hacen las colas.

**Contexto de uso, que condiciona todo el diseño:**

- Los operarios cargan **desde el celular, en planta**, a veces con guantes.
- Oficina y auditoría miran desde la PC.
- Volumen real: **~16 tandas por día** (≈11 del trompo A, ≈5 del B), ~160 m²
  diarios, ~48 estanterías en circulación a la vez, un turno. Unos 100
  movimientos por día. **Es una app de bajo volumen y alta exigencia de
  claridad.** Optimizar throughput sería resolver el problema equivocado.

---

## 2. Stack

Igual que Control-Secaderos, por las mismas razones y para que el mantenimiento
sea uno solo: Next.js 15 (App Router), React 19, Tailwind v4, Drizzle, sesión
JWT con `jose` en cookie, PIN con `bcryptjs`, `exceljs`, deploy en Vercel región
`gru1`.

**Dos cosas cambian y tienen su sección propia:** la base es **PostgreSQL en
Neon**, no Supabase, y el driver es `@neondatabase/serverless` en vez de
`postgres-js`. El porqué está en §9.

Idioma: **español rioplatense** en tablas, columnas, funciones y variables.
Comentarios de código **sin tildes** (evita problemas de codificación en
terminales Windows); textos de UI **con tildes**.

---

## 3. La decisión de modelado central

La pregunta de arranque fue *"¿seguimos los moldes o las piezas?"*, porque en el
desmolde toman caminos distintos. La respuesta es **ninguno de los dos por
separado**, y sale de tres hechos de planta:

1. **Un grupo de moldes es estable.** Los 40 moldes de Kamba gris de una
   estantería son siempre esos mismos 40. No se mezclan ni con los de otra
   estantería del mismo producto. El soporte físico sí se cambia todo el tiempo,
   así que la identidad viaja con los moldes, no con el fierro.
2. **Una estantería lleva un solo producto y un solo color.**
3. **Un palet sale de una sola estantería.**

Con eso, molde y pieza son el mismo objeto físico en el mismo lugar desde el
llenado hasta el desmolde, y lo que sale del desmolde se corresponde uno a uno
con lo que entró. Entonces no hacen falta dos entidades: hace falta **una sola,
el ciclo**, que acá se llama **tanda**.

### 3.1 El circuito

```
   ┌── la tanda RETIENE la estantería ───────┐
   │                                          │   ya no la retiene
   ▼                                          ▼  ┌───────────────┐
 patio ──▶ horno ──▶ a_desmoldar ──DESMOLDE──▶ a_empaquetar ──▶ listo
   │  ▲                   │
   │  └── devolucion ──────┘
   └──── fraguado_natural ─────▶ a_desmoldar
```

| Estado | Quién lo mueve | Qué pasa |
| --- | --- | --- |
| **patio** | Trompo | Se llenó la estantería y fragua a la intemperie |
| **horno** | Hornero | Entran hasta 18 tandas. Suelen estar 24 hs o menos |
| **a_desmoldar** | Hornero | Salió del horno y espera turno de desmolde |
| **a_empaquetar** | Desmolde | Se separaron moldes y piezas. **La estantería queda libre** |
| **listo** | Empaque | Se contaron los paquetes. Listo para entregar |

**El desmolde libera la estantería pero no termina la tanda.** Esa es la clave
del modelo: en la planta la estantería vuelve al trompo el mismo día mientras las
piezas todavía esperan el túnel. Una estantería está disponible cuando no tiene
ninguna tanda suya en `patio`, `horno` o `a_desmoldar` — es una consulta, no un
estado paralelo que haya que mantener sincronizado.

### 3.2 Regla de oro sobre los tipos de movimiento

> **Si dos cosas se van a medir distinto, son dos tipos de movimiento distintos.**

Heredada de Control-Secaderos y responsable de dos decisiones acá:

- **`fraguado_natural`** (patio → a_desmoldar sin pasar por el horno) no se
  registra como `salida_horno`. Toda la estadística de horno mide `duracion_min`
  de las salidas, y estas tandas nunca estuvieron adentro: contarlas metería
  esperas de dos días en el promedio de un ciclo de 24 horas.
- **`devolucion_horno`** (salió sin fraguar y vuelve a la cola) no es una
  `correccion`. Es un hecho productivo, no un error de carga. Mezclarlos haría
  imposible distinguir un problema de proceso de un error humano.

### 3.3 El motivo del fraguado natural es obligatorio

Cualquier tanda puede saltearse el horno; no depende del producto sino de **la
disponibilidad del horno y del clima**. Y esos dos motivos **miden cosas
opuestas**:

- `horno_lleno` → capacidad perdida. Es el número con el que se justifica un
  horno nuevo.
- `clima` → ahorro de energía.

Promediarlos da un número que no sirve para decidir nada. Por eso el motivo va
en el movimiento y es obligatorio.

Dato que sale gratis de esto: con 18 lugares, ciclo de ~24 hs y ~16 tandas
diarias, **el horno está trabajando cerca del 90%**. La serie de
`fraguado_natural` por `horno_lleno` es probablemente el indicador más
importante de inversión que va a producir esta app.

### 3.4 Roles

| Rol | Qué hace |
| --- | --- |
| `admin` | Todo. ABM, parámetros y corrección de cualquier tanda |
| `trompo` | Crea la tanda: producto, trompo A/B y **cuántos moldes llenó** |
| `horno` | Entrada y salida de horno, fraguado natural, devolución |
| `desmolde` | Marca que se desmoldó. **No carga cantidades** |
| `empaque` | Cuenta los paquetes y cierra la tanda |
| `oficina` | Ve el resumen del día. No opera |
| `auditor` | Ve todo, no modifica nada |

Desmolde y empaque son **puestos separados** y registran cosas distintas, a
pedido de planta.

---

## 4. Unidades: molde → pieza → paquete

El paquete es la unidad mínima entregable, y la relación con el molde no es fija.
Los tres casos del negocio salen de **dos enteros chicos por producto**, usando
la pieza como pivote:

| Caso | `piezas_por_molde` | `piezas_por_paquete` | 38 moldes dan |
| --- | --- | --- | --- |
| Mayoritario: 1 molde = 1 paquete | 1 | 1 | 38 paquetes |
| 2 moldes = 1 paquete | 1 | 2 | 19 paquetes |
| 1 molde = 2 piezas que no se empaquetan | 2 | 1 | 76 paquetes |

Más `m2_por_paquete`, que convierte todo a la unidad comercial. Va como
`numeric`, no como float: la coma flotante no cierra al sumar miles de paquetes.

**Con `piezas_por_paquete = 2` y piezas impares queda una suelta sin par.** La
pantalla lo dice en vez de redondear en silencio: es una pieza que después
alguien va a buscar en el piso.

### 4.1 `requiere_tunel` no cambia la máquina de estados

Hay productos que no pasan por el túnel termocontraíble. **Igual pasan por la
estación de empaque**, porque ahí es donde se cuenta, y el conteo es lo único que
sostiene la medición de rotura. Si saltearan la estación, nunca se contarían y
para esos productos la rotura sencillamente no existiría.

La bandera solo cambia lo que dice la pantalla: *"Empaquetar"* o *"Contar y
cerrar"*.

---

## 5. La rotura se calcula, no se carga

```
estantería de 39 moldes, se llenaron 38   →  38 paquetes esperados
el empaque contó 37                        →  rotura = 1
```

Nadie carga la rotura: sale de la diferencia entre dos hechos que ya se
registran. Mismo principio que el desvío del plan en Control-Secaderos.

### 5.1 Los dos números que sostienen todo

Como el desmolde no cuenta nada, la medición entera se apoya en
`moldes_llenados` (trompo) y `paquetes` (empaque). Si el del trompo pone 39 de
memoria cuando llenó 38, la rotura sale mal por 1 y nadie se entera.

Por eso la pantalla del trompo viene con el nominal de la estantería y arriba,
grande, los atajos **−1 / −2 / otro**: el llenado parcial es habitual y el motivo
casi siempre es que **no alcanzó la mezcla**.

Ese faltante, además, se mide: si es un molde por tanda con 16 tandas diarias y
~0,26 m² por molde, son del orden de **4 m² por día ≈ 1.000 m² al año** perdidos
por dosificación. Probablemente sea el primer número accionable que produzca la
app.

### 5.2 La rotura NUNCA se atribuye al empaquetador

**El empaque no genera rotura, solo la evidencia.** El mayor porcentaje se rompe
en el desmolde.

Esto es una trampa fácil de comer: el número aparece en el movimiento de empaque,
ese movimiento tiene un usuario, y una pantalla de "rotura por operario" armada
sin pensar culparía justo al único que no la causó.

La rotura pertenece a la **tanda**, y se abre por producto, por trompo, por
responsable del llenado, por quién desmoldó y por si pasó o no por el horno.
**Nunca por quién contó.**

Corolario aprovechable: como cada etapa registra quién la hizo, aunque el
desmolde no cargue cantidades **se puede comparar la rotura entre
desmoldadores**. Si las tandas de uno rompen 8% y las de otro 3%, ahí está la
respuesta a dónde se va la mayor pérdida, sin agregar un campo de carga.

---

## 6. Esquema

```
usuarios         usuario, nombre, pin_hash, rol, activo,
                 intentos_fallidos, bloqueado_hasta
modelos          nombre, activo, orden                      -- la forma
familias         nombre, activa, orden                      -- compatibilidad de molde
productos        modelo_id, familia_id, nombre, piezas_por_molde,
                 piezas_por_paquete, requiere_tunel, m2_por_paquete, activo
estanterias      codigo, modelo_id, familia_id, moldes, activa
tandas           codigo, estanteria_id?, producto_id + snapshots,
                 factores de conversión (snapshot), trompo, moldes_nominal,
                 moldes_llenados, paquetes?, motivo_rotura, estado,
                 estado_desde, estanteria_liberada_en, rehornear
movimientos      tanda_id + snapshots, tipo, estado_desde, estado_hasta,
                 usuario_id + nombre, duracion_min, trompo?, moldes_llenados?,
                 paquetes?, motivo_fraguado?, nota, creado_en
motivos_rotura   nombre, activo
config           clave (PK), valor (text)
```

Fijate que **no hay tabla de contenido ni líneas de movimiento**. Control-Secaderos
las necesitaba porque un secadero llevaba varios modelos a la vez; acá una
estantería lleva un solo producto, así que el producto vive en la tanda y las
líneas de detalle desaparecen enteras.

Tampoco hay tabla de moldes. Una estantería **es** un grupo de moldes, y
`moldes` es un entero. *"¿Cuántos moldes libres tengo de Kamba gris?"* es
*"¿cuántas estanterías de Kamba gris no tienen tanda abierta?"*.

### 6.1 Convenciones que atraviesan todo

**a) Snapshots en el historial.** `tandas` guarda `producto_nombre`,
`modelo_nombre`, `familia_nombre`; `movimientos` guarda `tanda_codigo`,
`producto_nombre` y `usuario_nombre`. El historial se sigue leyendo aunque
después se renombre cualquier cosa. Las FK se conservan igual, para poder agrupar
por id.

**b) Los factores de conversión también son snapshot.** Es la columna que más
fácil se olvida y la que más caro sale. Si `piezas_por_paquete` se leyera del
producto al momento de **consultar**, el día que alguien corrija un factor se
reescribiría en silencio la rotura de todos los meses anteriores.

**c) `null` con significado propio, distinto de cero.**
- `tandas.paquetes = null` → **todavía no se contó**. No es una tanda que dio
  cero paquetes. Consecuencia de UI: el campo vacío produce `null`; nunca usar
  `Number("")`, que da `0` y significa otra cosa.
- `tandas.estanteria_id = null` → el sistema **no sabe cuál** de los grupos se
  usó, y no finge saberlo. Ver §6.2.

**d) La duración se calcula al escribir, no al leer.** `movimientos.duracion_min`
guarda cuánto duró el estado *anterior*, calculado contra `tandas.estado_desde`.
Así la estadística no reconstruye líneas de tiempo tanda por tanda:

```
entrada_horno  → cuánto esperó en el patio
salida_horno   → cuánto tardó el horno de verdad
desmolde       → cuánto esperó para desmoldarse
empaquetado    → cuánto esperó para empaquetarse   ← el agujero que motivó la app
```

**e) El código de tanda es correlativo y no se reusa nunca.** Es una mejora
deliberada sobre Control-Secaderos, donde el historial tiene "secadero 42" mil
veces y hay que mirar la fecha para saber de cuál se habla. Acá un reclamo de
calidad de hace tres meses se resuelve con un número — y ese número es el que va
escrito en **la tarjeta colgada del soporte**, que es lo que permite distinguir
dos tandas del mismo producto en el patio.

**f) Nada se borra.** Productos y estanterías se suspenden. Los errores se
arreglan con una **corrección de admin**, que queda registrada como movimiento
con nota obligatoria.

### 6.2 Por qué `tandas.estanteria_id` es nullable

Hoy las estanterías de un mismo producto no se distinguen entre sí en el piso: si
hay 3 de Uhma beige, nadie sabe cuál agarró. El sistema cuenta cuántas hay libres
de cada modelo+familia, que es la pregunta operativa real, pero **no pretende
saber cuál es cuál**.

El día que se marquen los grupos, la columna se empieza a llenar y aparecen las
estadísticas de desgaste por estantería — que son información real, porque los
moldes de un grupo envejecen juntos, que es justamente por qué no se mezclan.
Dejarla nullable desde el día uno hace que ese cambio no sea una migración de
datos.

---

## 7. Import/export Excel

Mismo patrón que Control-Secaderos, ya probado. Aplica a familias, modelos,
productos, estanterías y usuarios.

**Dos reglas que no se negocian:**

1. **La planilla nunca borra.** Lo que no está en el archivo queda como estaba.
   Subir una planilla recortada por error no puede vaciar la instalación.
2. **O entra todo o no entra nada.** Una sola fila con problema rechaza la
   importación entera: después de un import a medias nadie sabe qué quedó
   aplicado.

Por eso son dos pasos: `analizar*` muestra fila por fila qué va a pasar (crear /
actualizar / sin cambios / error) y `importar*` lo aplica en una transacción.

La lectura es **tolerante**: acentos, mayúsculas, columnas de más, filas en
blanco, alias de encabezados (`forma`/`modelo`, `color`/`familia`). Los errores
dicen **qué fila y qué columna**, nunca "formato inválido".

El export es de ida y vuelta: exportás, editás en la compu, importás. Más un
**"Descargar todo"** que baja un `.xlsx` con una hoja por tabla, historial
incluido.

> **Ese Excel no es un backup.** Es una copia legible para llevarse los números.
> Restaurar el grafo de claves foráneas desde una planilla no es confiable. El
> backup de verdad es un `pg_dump` programado. Ver §9.4.

---

## 8. Estadísticas

- Tiempo por etapa del circuito → dónde se hacen las colas. El tramo
  `a_empaquetar` es el que motivó la app.
- Tiempo de horno real, promedio/mín/máx, abierto por producto.
- **Tandas que no fraguaron**: compara la duración de los ciclos que necesitaron
  devolución contra los que no. Esa diferencia es el tiempo mínimo real de horno,
  **medido y no estimado**.
- **m² fraguados fuera del horno por `horno_lleno`** → capacidad perdida.
- Rotura por producto, por trompo, por responsable de llenado, por desmoldador, y
  con horno vs. sin horno. **Nunca por empaquetador** (§5.2).
- Moldes sin llenar por falta de mezcla, en moldes y en m².
- Producción diaria en paquetes y en m².
- Ocupación del horno contra los 18 lugares.

Un turno solo, así que agrupar por fecha civil es correcto. Las maquinadas del
trompo se atribuyen **al empleado responsable**, no al turno.

---

## 9. Base de datos: Neon, proyecto propio

**Decision revisada.** El diseno arranco con "misma base que Control-Secaderos,
esquema separado". Se cambio a **bases separadas** por una razon operativa: las
dos apps no comparten ni una tabla, ni un usuario, ni un join, asi que lo unico
que se ganaba compartiendo era una sola credencial. Lo que se perdia es mas
importante: **una base gratuita sin SLA no deberia ser el punto unico de falla de
dos lineas de produccion**. Si esta app satura la base, con una sola se cae
Secaderos tambien.

Separar no cuesta nada: el plan gratuito de Neon da **100 proyectos y las cuotas
son por proyecto** (0,5 GB de storage y 100 CU-horas mensuales cada uno). Tener
otra app en Neon no le saca nada a esta.

Dimensionamiento, para que quede escrito: ~4.000 tandas y ~24.000 movimientos por
ano son unos **15-20 MB anuales**. Los 0,5 GB alcanzan para mas de veinte anos.
El almacenamiento no es —ni va a ser— la restriccion.

### 9.1 Region: `aws-sa-east-1` (Sao Paulo)

Misma zona que el deploy de Vercel. Estar lejos suma ~100 ms por consulta, y
**la region de un proyecto de Neon no se puede cambiar**: para moverla hay que
crear otro proyecto y migrar los datos. Es la unica decision irreversible del
armado.

### 9.2 El driver cambia respecto de Secaderos

Secaderos usa `postgres-js`, que hace pipelining y por eso obliga al pooler en
modo sesion, donde cada conexion ocupa un lugar mientras viva. En serverless cada
instancia de Vercel abre la suya, asi que el pool se vuelve el techo de
instancias concurrentes y pasado ese numero toda pantalla devuelve 500.

Aca va `@neondatabase/serverless` con `drizzle-orm/neon-serverless`, que esta
hecho para serverless y no tiene ese techo.

**Va la variante WebSocket, no la HTTP.** `neon-http` es mas rapida pero **no
soporta transacciones interactivas**, y todo el motor de movimientos corre dentro
de una transaccion que empieza con `SELECT ... FOR UPDATE` para que dos operarios
no muevan la misma tanda.

En runtime se usa la cadena **pooled** (host con `-pooler`); drizzle-kit usa la
**directa** via `DIRECT_URL`.

### 9.3 El esquema propio se mantiene igual

Todo sigue viviendo en el esquema `estanterias` y no en `public`, aunque ahora la
base sea exclusiva. Ya no hace falta para evitar choques de nombres: queda como
red de seguridad. `drizzle-kit push` propone **borrar todo lo que no reconoce**,
asi que si alguien alguna vez copia el `DATABASE_URL` equivocado y apunta esta
app a la base de Secaderos, el `schemaFilter: ["estanterias"]` hace que igual no
pueda tocar una sola tabla de la otra app.

### 9.4 Lo que el plan gratuito NO da: backups

Ni Neon ni Supabase incluyen backups automaticos en sus planes gratuitos. Neon da
6 horas de *instant restore* y un snapshot manual, que no es lo mismo.

Para produccion hace falta un **`pg_dump` programado** a una maquina propia o a
Drive. Es lo que convierte "gratis" en "aceptable para una fabrica", y vale mas
que la eleccion de proveedor. El export a Excel de la app (§7) **no cumple esa
funcion**.

### 9.5 Trampas heredadas que siguen aplicando

Documentadas en el `ARQUITECTURA.md` de Control-Secaderos y validas igual aca:

- **`push` no rellena filas.** Sincroniza el esquema, no los datos: una columna
  nueva queda en `null` para todo lo existente. Despues de cada migracion hay que
  preguntarse explicitamente *que filas ya existentes quedan con el valor
  equivocado*.
- **Orden de despliegue para cambios aditivos:** primero migrar la base, despues
  desplegar el codigo. Al reves hay una ventana en la que el codigo nuevo
  consulta algo que no existe.
- **Revertir no siempre es seguro.** Agregar una columna nullable si lo es;
  cambiar la semantica de datos existentes, no.
- **Un script de verificacion de deploy no debe poder tumbar produccion.**

### 9.6 Nota sobre el scale-to-zero

El compute de Neon se apaga a los 5 minutos sin uso, asi que **la primera carga
del dia tiene un arranque en frio perceptible**. Con un turno diario de ~10 horas
el consumo ronda las 55 CU-horas mensuales sobre las 100 disponibles, asi que la
cuota sobra; lo unico que se nota es ese primer request.

## 10. Supuestos pendientes de confirmar

Marcados para no olvidarlos:

- **Descarga del horno de a poco.** La pantalla deja elegir cuáles salen, más un
  botón de "sacar todo". Cubre las dos formas.
- **FIFO como orden por defecto** en toda cola: lo más viejo primero. Las
  devoluciones de horno van antes que todo, porque ya vienen demoradas y
  retienen una estantería que debería estar produciendo.
- **Datos maestros sin cargar**: falta la tabla de m² por paquete y el listado
  real de estanterías (modelo, familia, cantidad de moldes). Las tablas quedan
  vacías y se cargan por panel o por Excel.
- **Sin estado de "moldes fuera de servicio"**: el llenado parcial es por falta
  de mezcla, no por moldes rotos. Si algún día se rompen moldes seguido, ahí sí
  conviene.
- **Sin receta de pastón**: por ahora alcanza con saber qué trompo y quién fue el
  responsable. La receta queda para el final.
- **Alcance hasta `listo`**: no hay stock ni despacho a cliente.
