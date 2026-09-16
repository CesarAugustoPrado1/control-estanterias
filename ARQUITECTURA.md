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
veces y hay que mirar la fecha para saber de cuál se habla. Ese código sigue
siendo **la identidad interna** de la tanda para siempre, pero **no es lo que lee
la gente en el piso**: en planta cada tanda se nombra con una palabra del
diccionario escrita en su tarjeta (ver §10). La palabra se reutiliza; el código no.

**f) Nada se borra.** Productos y estanterías se suspenden. Los errores se
arreglan con una **corrección de admin**, que queda registrada como movimiento
con nota obligatoria.

### 6.2 Por qué `tandas.estanteria_id` es nullable

Cuando se escribió el esquema, las estanterías de un mismo producto no se
distinguían entre sí en el piso: si había 3 de Uhma beige, nadie sabía cuál
agarró. El sistema contaba cuántas había libres, pero **no pretendía saber cuál
era cuál**.

Eso cambia con las **placas de grupo** (§10.4): cada grupo de moldes va a tener
su identificación fija, el trompo va a elegir la estantería concreta y la columna
se va a llenar siempre. Se deja nullable igual, para las tandas históricas y para
las cargadas antes de tener placas: así el cambio no obliga a inventar datos.

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

### 9.4 Backups: el plan gratuito no los da

Ni Neon ni Supabase incluyen backups automáticos en sus planes gratuitos. Neon da
6 horas de *instant restore* y un snapshot manual, que no es lo mismo. El export a
Excel de la app (§7) **no cumple esa función**: no se puede restaurar desde ahí.

**Solución: `.github/workflows/backup.yml`**, un `pg_dump` diario que corre en
GitHub Actions a las 06:00 de Argentina (y a mano desde la pestaña *Actions*).

- **pg_dump corre en un contenedor `postgres:18`.** Tiene que ser de la misma
  versión mayor que el servidor o más nueva: un `pg_dump` viejo se niega a volcar
  un servidor nuevo, y el que trae Ubuntu no es 18.
- **Usa la cadena directa, nunca la del pooler**: sobre el pooler un volcado largo
  se corta a mitad de camino.
- **Comprueba que el volcado se puede leer** (`pg_restore --list`) antes de
  guardarlo. Un backup que no se puede restaurar no es un backup, y el momento de
  enterarse no es el día que hace falta.
- **Se cifra antes de subirse.** El repo es **público**, y los artefactos de un
  repo público los puede descargar cualquiera con cuenta de GitHub. El volcado sin
  cifrar nunca sale de la máquina efímera del runner.
- Se guardan **30 días** de copias.

**Configuración (una sola vez):** en GitHub, *Settings → Secrets and variables →
Actions*, cargar dos secretos:

| Secreto | Valor |
|---|---|
| `NEON_DIRECT_URL` | la cadena **directa** de Neon (sin `-pooler`) |
| `BACKUP_CLAVE` | una frase larga, **guardada también fuera de GitHub**: sin ella los backups no se pueden abrir |

**Restaurar** (con Docker, para no instalar herramientas de Postgres):

```bash
# 1. Descargar el artefacto desde la pestaña Actions y descomprimirlo
gpg --decrypt estanterias_AAAA-MM-DD_HHMM.dump.gpg > backup.dump

# 2. Restaurar. --clean BORRA lo que hay en el esquema antes de cargar el backup.
docker run --rm -i postgres:18 pg_restore --clean --if-exists --no-owner   -d "CADENA_DIRECTA_DE_NEON" < backup.dump
```

Dos advertencias:
- **Probar la restauración en una rama de Neon, no sobre producción.** Neon permite
  crear una rama de la base en segundos; se restaura ahí y se compara.
- **GitHub desactiva los workflows programados** de un repo público después de 60
  días sin actividad en el repositorio. Si la app queda estable mucho tiempo sin
  cambios, hay que entrar a *Actions* y reactivarlo.

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

---

## 10. Identificación en planta: tarjetas de tanda y placas de grupo

> **Estado:** decidido con planta en septiembre de 2026. **El código todavía no
> lo implementa.** Hoy la app muestra códigos `E-00042`, el trompo elige por
> producto y el cemento no existe como dato. Esta sección es el diseño a construir,
> y las razones de cada decisión.

### 10.1 El problema

En el piso la gente lee, dice en voz alta y a veces escribe el identificador de
cada tanda, cientos de veces por semana. Un código como `E-00283` está pensado
para la base de datos, no para personas: los dígitos se confunden entre sí y nadie
grita en el patio "¿salió la cero cero dos ocho tres?".

Y hay un segundo problema: **con los moldes llenos el dibujo queda tapado** por la
mezcla. Una estantería llena de Kamba gris y una de Uhma beige se ven iguales.

El objetivo, dicho por planta: **que un error de identificación pase una vez por
mes, no tres veces por día.** Cuando algo se repite cien veces por día, pedir
atención no alcanza, porque la atención se gasta. El diseño sigue tres principios:

1. **Que el error no se pueda cometer**, en vez de pedir cuidado.
2. **Menos decisiones humanas**: cada elección es una oportunidad de equivocarse.
3. **Lo que no se pueda evitar, que se detecte en el paso siguiente**, antes de que
   la información mala se propague.

### 10.2 Dos identificaciones con papeles que no se cruzan

| | Placa de grupo | Tarjeta de tanda |
|---|---|---|
| Dice | **Qué es:** modelo, familia y número (`UHMA · BEIGE · 03`) | **Qué tanda y qué día:** `ABEJA`, lunes |
| Dura | Para siempre | Un ciclo |
| Sujeción | Fija a un contramolde, no se saca | Colgada, se mueve |
| En el desmolde | **Se queda con los moldes** | **Se va con las piezas** al palet |
| Color | Todas iguales, neutras | Un color por día |

La consecuencia más útil para el piso: **una estantería sin tarjeta está
disponible.** No hace falta ningún otro cartel para decirlo.

Y como la placa no se puede sacar, **hay una sola cosa suelta por estantería**: la
tarjeta. Las dos identificaciones no se pueden intercambiar por error.

### 10.3 La tarjeta de tanda: una palabra

**Una palabra del diccionario en vez de un código.** Sustantivos concretos y
conocidos —cosas que se pueden imaginar—, porque se leen, se dicen y se recuerdan
mucho mejor que un número. La lista está en `datos/palabras.json` (fuente de
verdad) y `scripts/palabras-excel.ts` genera una planilla para revisarla.

**La letra dice el día del llenado:**

| Día | Letra | Color de la tarjeta |
|---|---|---|
| Lunes | A | amarillo |
| Martes | B | azul |
| Miércoles | C | rojo |
| Jueves | D | verde |
| Viernes | E | naranja |
| Sábado | F | violeta |
| Domingo | G | rosa |

Así una tarjeta amarilla en el patio un miércoles dice, sin mirar ninguna
pantalla, que esa tanda es del lunes y viene demorada. Los colores son una
propuesta a confirmar; lo que sí es regla es qué colores **no** pueden usarse:

- **Blanco**, reservado en toda la planta para el cemento blanco (§10.5).
- **Los colores de las familias** (beige, gris, negro, terracota, habano), para que
  el color de una tarjeta nunca parezca decir algo sobre el producto.

**Regla de sonido: cada día es un sonido, y ningún par de días comparte sonido.**
Salió de una observación de planta sobre la C, y se generalizó:

- La C solo como *ca, co, cu, cl, cr*. *Cebolla* suena a S y alguien que la
  escucha no sabe que es miércoles.
- La G solo como *ga, go, gu, gl, gr*. *Girasol* suena a J.
- Ninguna palabra empieza con H muda: *hoja* se escucha "oja".
- Ningún día usa V, K ni Q, porque comparten sonido con B y con C.

**Curación de la lista** (el script la verifica sola):

- 70 palabras por letra. Sobran a propósito: cubren el caso raro de estanterías
  olvidadas en el patio, y no molestan.
- **Rondas: las palabras que conviven empiezan distinto.** El comienzo de una
  palabra son sus consonantes iniciales más la primera vocal (*BA*rco, *BRÚ*jula,
  *GU*itarra) o, si empieza con vocal, sus dos primeras letras (*AB*eja). Dentro de
  cada ronda cada comienzo aparece una sola vez, y un comienzo solo aparece en la
  ronda N si apareció en la N−1. Se cuenta por letras y no por sonido, a
  propósito: *cuaderno* y *cuchillo* cuentan igual. Es más estricto.
  - Hay entre 7 y 15 comienzos con sustantivos conocidos por letra, y un día normal
    tiene 16 a 20 llenados: algunos días conviven dos palabras con el mismo
    comienzo. Para eso, la segunda palabra de cada comienzo no sigue con la misma
    letra que la primera (*barco* y *ballena*, no *barco* y *barril*).
  - **No se fuerzan palabras raras.** Un comienzo sin un sustantivo común se
    saltea, aunque la ronda quede más chica: es peor tener una palabra que nadie
    conoce entre las más usadas que repetir un comienzo.
  - Por esta regla la C y la G admiten también *cl, cr, gl, gr*, que suenan duras.
- Ningún par del mismo día difiere en una sola letra (*búho/buzo*,
  *bandera/bañera*). Entre las primeras 25, tampoco en dos (*bombo/bolso*).
- Ninguna palabra se repite entre días.
- Afuera: palabras del proceso (trompo, horno, palet, gancho, balde…), colores y
  tonos (arena, perla, almendra…), materiales de planta (cemento, cal, piedra,
  baldosa…), objetos de seguridad o alarma (fuego, gas, casco, guante…) y las que
  en planta se prestan a chiste o sirven de insulto (burro, foca, gato…).

**Siempre se usa la primera palabra libre, de arriba para abajo.** Tres
consecuencias que no son obvias:

1. **El orden de la lista importa más que el largo.** Con ~16 llenados por día, las
   primeras 20 salen todos los días y las del fondo casi nunca. Arriba van las más
   claras; abajo pueden ir las regulares.
2. **Las palabras se vuelven familiares.** "La ABEJA" pasa a ser tan natural como
   "la primera del lunes".
3. **Una palabra viva es única en la planta.** Si la ABEJA del lunes pasado siguiera
   en el circuito, ABEJA no estaría libre y hoy se usaría la siguiente. Así que **no
   existe la duda de "¿es de este lunes o del anterior?"**. La ambigüedad queda solo
   en el historial de meses atrás, y ahí la resuelven la fecha y el código interno.

**Tablero de ganchos, uno por día**, con la palabra escrita debajo de cada gancho
en el orden de la lista. El primer gancho con tarjeta es la palabra que indica la
app, así que el operario no busca: agarra la primera. **Un gancho vacío es una
tanda viva de ese día.**

**Fabricación gradual.** No hacen falta las 490 tarjetas (7 × 70) de entrada: con
las primeras 25 o 30 de cada día hábil alcanza para arrancar. La app tiene que saber
cuántas tarjetas existen físicamente por letra, para no mandar a buscar una que no
se hizo.

### 10.4 La placa de grupo

**Una placa por grupo de moldes, fija a uno de sus contramoldes** (ABS o madera).
Confirmado en planta: cuando un grupo cambia de soporte, **los moldes se pasan
todos juntos**. Por eso alcanza con que uno de ellos lleve la placa: viaja con el
grupo sin que nadie tenga que acordarse. No hay moldes de silicona sola, así que
todos los grupos tienen dónde fijarla.

**No se rotula molde por molde.** Se evaluó y se descartó: son miles de moldes, es
inviable como trabajo, y con el uso cualquier marca se pierde o deja de verse.

La placa dice **modelo, familia y número**. **No dice el cemento**, porque el
cemento se reasigna más seguido que la familia y se marca de otra forma (§10.5).
Todas las placas son del mismo color: como son iguales entre sí, el color no dice
nada y no compite con el color de la tarjeta.

Lo que habilita:

- El trompo elige **la estantería concreta** que tiene adelante, no un producto.
- `tandas.estanteria_id` se llena siempre (§6.2), y aparece la historia de cada
  grupo: cuántos ciclos lleva y si rompe más que otros del mismo producto. Es
  información real, porque los moldes de un grupo envejecen juntos.

### 10.5 El cemento como dato propio

**La compatibilidad de un grupo de moldes es modelo + familia + cemento.** Caso
real: había tres estanterías de Uhma beige para cemento gris; al incorporar el
cemento blanco se separó una, porque los moldes no se pueden mezclar. Quedaron dos
de gris y una de blanco, que se vende a pedido. Y la situación se repite en otros
modelos.

El cemento es una columna propia, y no parte del nombre de la familia
("Beige — cemento blanco"), por tres razones:

- **Es lo que prohíbe físicamente mezclar**: la regla más importante del sistema
  tiene que ser explícita.
- **Es una diferencia comercial** (el blanco se hace a pedido): se va a querer medir
  por cemento sin separar nombres a mano.
- **Se repite en muchos modelos**: meterlo en la familia duplicaría todas las
  familias.

**El error más caro del sistema es llenar una estantería de cemento blanco con
mezcla de cemento gris.** No es un error de registro que se corrige: contamina los
moldes y el producto sale sucio. Las defensas:

1. **Verificación antes de volcar.** El trompo identifica la estantería **antes** de
   llenar, y la app muestra en grande modelo, familia y cemento. Una verificación
   que llega después de lo irreversible no sirve.
2. **Laterales pintados de blanco.** Las estanterías de cemento blanco llevan los
   cuatro laterales del contramolde pintados con aerosol blanco, sin tocar el molde.
   Se reconocen a veinte metros. La pintura se repasa cuando haga falta (del orden de
   una vez por mes); cualquier aerosol sirve.
3. **Blanco reservado.** Ninguna tarjeta, placa ni cartel usa blanco para otra cosa.

**Los dos trompos hacen los dos cementos**, así que la app no puede bloquear por
trompo. Lo que sí puede hacer, sin pedir ningún dato nuevo: sabe qué cemento fue la
última tanda de cada trompo, y **si cambia, avisa**: *"El trompo A viene de cemento
gris. ¿Se lavó?"*. Solo aparece cuando hay cambio de cemento, que es poco
frecuente, para que no se vuelva un cartel que se acepta sin leer. Por eso el
trompo se elige al principio del llenado, junto con la estantería.

### 10.6 Reasignaciones de familia o de cemento

Cambiar un grupo de familia de color **es una decisión de empresa, rara y con
costo aceptado**: las primeras tandas después del cambio salen manchadas aunque se
laven los moldes. Por eso hay estanterías fijas por color. El cambio de cemento es
más frecuente, pero también deliberado.

- **Solo con la estantería vacía**, sin tanda abierta. Si no, una tanda cambiaría
  de cemento en mitad del circuito.
- **Registrado con fecha y motivo**, como acto de un rol con permiso.
- **El historial no cambia**: cada tanda guarda qué era al llenarse.
- **Cambio de familia → placa nueva.** Cambio de cemento → pintar o despintar.
- **La app mide el costo.** La rotura de las primeras tandas posteriores al cambio
  *es* el costo que se aceptó: cuántos ciclos tarda en dejar de manchar y cuántos
  paquetes se perdieron. La próxima vez que se discuta un cambio, hay un número real
  sobre la mesa.

### 10.7 El circuito visto desde el piso

1. **Trompo.** Elige una estantería **sin tarjeta** y la identifica por su placa
   *antes de volcar*. La app muestra modelo, familia y cemento en grande y, si el
   trompo cambió de cemento, pregunta por el lavado. El operario llena, carga
   cuántos moldes llenó y la app indica la tarjeta: *"ABEJA — colgala en la
   estantería"*. Toma la primera del tablero del día y la cuelga.
2. **Patio.** Nadie registra nada. El color de la tarjeta dice el día.
3. **Entrada al horno.** El hornero ve el patio por palabra y antigüedad, marca las
   que entran y confirma. Las tarjetas entran con las estanterías.
4. **Salida del horno.** Igual. Las tarjetas siguen puestas.
5. **Desmolde.** Separa piezas y moldes, **pasa la tarjeta al palet** y registra. La
   app muestra *"ABEJA → UHMA · BEIGE · 03"* para verificar a ojo que la placa
   coincide, con un botón para cuando no coincide. La estantería, ahora sin
   tarjeta, vuelve al trompo. Si **no fraguó**: la tarjeta se queda en la estantería,
   que vuelve a la cola del horno con una **pinza roja** en la tarjeta, además de la
   marca REHORNEAR de la app.
6. **Espera del túnel.** El palet espera con su tarjeta. Es el tramo que hoy no se
   ve, y ahora se ve solo: un palet con tarjeta amarilla un jueves es un lunes sin
   empaquetar.
7. **Empaque.** Cuenta los paquetes y cierra la tanda. La app indica *"devolvé
   ABEJA al gancho del lunes"*. Los paquetes quedan listos sin tarjeta.

**El piso de un vistazo:**

| Se ve | Significa |
|---|---|
| Estantería sin tarjeta | Moldes vacíos, lista para el trompo |
| Estantería con tarjeta | Llena: patio, horno o esperando desmolde |
| Laterales blancos | Cemento blanco |
| Tarjeta con pinza roja | No fraguó, vuelve al horno primero |
| Palet con tarjeta | Desmoldado, esperando empaque |
| Paquetes sin tarjeta | Listos |
| Gancho vacío en el tablero | Una tanda de ese día sigue en la planta |

### 10.8 Escaneo con QR o NFC: descartado por ahora

- **QR:** el ambiente es muy sucio; cualquier código se tapa y la cámara no lo lee.
- **NFC:** técnicamente viable —todos los teléfonos son Android, y Chrome en
  Android lee NFC desde el navegador—, pero el costo de chips industriales para ~490
  tarjetas y todas las placas no está evaluado, y también tendrían que resistir el
  horno. Se reevalúa cuando planta ponga dispositivos propios, que van a ser Android.

**Consecuencia de diseño:** la identificación es por lectura y por selección en
listas. Las defensas contra el error pasan a ser:

- Listas **cortas y filtradas por estado**: el desmoldador solo ve lo que está
  esperando desmolde.
- **Palabras elegidas para no confundirse** dentro de un mismo día (§10.3).
- **Verificación cruzada tarjeta ↔ placa en el desmolde**, que es el traspaso crítico.
- **Conciliación tablero ↔ app.** Un gancho vacío que la app cree libre es una
  tarjeta que no volvió. Un gancho con tarjeta que la app cree en uso es un
  movimiento que no se registró.
- **Recorrida diaria:** la app lista lo que *debería* haber en patio y horno, y un
  supervisor lo compara con lo que ve.
- **Tiempos imposibles en rojo:** 60 horas de horno o una semana en el patio casi
  siempre es un movimiento sin registrar.

Nunca van a ser cero errores. El objetivo es que sean raros **y que nadie los
descubra un mes después.**

### 10.9 Materiales: a probar en el horno real

Ambiente: ~70 °C normal, hasta 80 °C, **100 % de humedad** y salpicaduras de
**cemento fresco, que es muy alcalino**.

- **Descartados:** papel plastificado (se despega), PVC común de credencial (se
  deforma), etiquetas autoadhesivas y texto impreso en superficie (se despegan o se
  borran al raspar el cemento), aluminio (el cemento lo ataca).
- **Acero inoxidable: no se da por bueno.** En planta se lo vio pudrirse dentro de
  cámaras de fraguado. Solo si pasa la prueba.
- **Candidato principal, para tarjetas y placas: plástico rígido industrial**
  (polipropileno o polietileno de alta densidad) **con el color en toda la masa** y
  el texto **grabado**, no impreso. Si el color es del material y la letra está
  hundida, raspar el cemento no les hace nada.
- **Sujeción de placas y ganchos:** a definir en la prueba, por el mismo problema
  del inoxidable.
- **Pintura blanca:** cualquier aerosol; se prueban distintas calidades.

**Antes de encargar nada:** dos o tres muestras de cada opción, un par de semanas
de uso real en el horno, con cemento incluido.

### 10.10 Cambios de datos previstos

- `productos`, `estanterias` y el snapshot de `tandas`: columna **cemento**
  (gris / blanco), y la compatibilidad pasa a exigir modelo + familia + cemento.
- `estanterias`: número de grupo para la placa, e historial de reasignaciones con
  fecha, motivo y quién.
- Tabla nueva **`tarjetas`**: letra, orden, palabra, si existe físicamente, y si
  está perdida.
- `tandas`: tarjeta asignada, con la palabra como snapshot, y el trompo elegido al
  inicio del llenado.
- En pantalla, **la palabra reemplaza al código** en todas las listas. El código
  correlativo queda para el historial, los exports y las búsquedas.

---

## 11. Supuestos pendientes de confirmar

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
- **Cantidad real de estanterías.** Planta duda entre ~80 y ~200. Define cuántas
  placas hay que fabricar; las tarjetas no dependen de eso, sino de cuántos
  llenados hay por día.
- **Colores de los días.** La tabla de §10.3 es una propuesta: falta confirmarla
  con lo que se consiga en plástico de color en masa.
- **Lista de palabras.** Generada y verificada, pendiente de revisión de planta en
  `datos/palabras-tarjetas.xlsx`; en particular, sacar cualquier palabra que
  coincida con el nombre comercial de un tono.
- **Prueba de materiales** en el horno real antes de encargar tarjetas, placas,
  sujeciones y pintura (§10.9).
- **Rastreo de paquetes después de "listo"**: postergado a pedido de planta.
