-- 0000 · Esquema base completo, para una base NUEVA.
--
-- Generado con `drizzle-kit generate` desde lib/db/schema.ts (que no se conecta a
-- la base). Crea todo de una vez, incluido lo que agrega 0001; por eso 0001 esta
-- escrita idempotente y sobre una base nueva no hace nada.
--
-- En la base que ya existia antes de las migraciones en SQL (la de prueba, creada
-- con `drizzle-kit push`), esta migracion se registro como aplicada sin correrla.
-- Ver ARQUITECTURA.md §9.5.

CREATE SCHEMA IF NOT EXISTS "estanterias";
--> statement-breakpoint
CREATE TYPE "estanterias"."cemento" AS ENUM('gris', 'blanco');--> statement-breakpoint
CREATE TYPE "estanterias"."estado_tanda" AS ENUM('patio', 'horno', 'a_desmoldar', 'a_empaquetar', 'listo');--> statement-breakpoint
CREATE TYPE "estanterias"."motivo_fraguado" AS ENUM('horno_lleno', 'clima', 'otro');--> statement-breakpoint
CREATE TYPE "estanterias"."rol" AS ENUM('admin', 'trompo', 'horno', 'desmolde', 'empaque', 'oficina', 'auditor');--> statement-breakpoint
CREATE TYPE "estanterias"."tipo_aviso" AS ENUM('tarjeta_no_coincide', 'tarjeta_perdida');--> statement-breakpoint
CREATE TYPE "estanterias"."tipo_movimiento" AS ENUM('llenado', 'entrada_horno', 'salida_horno', 'fraguado_natural', 'devolucion_horno', 'desmolde', 'empaquetado', 'correccion', 'cambio_tarjeta');--> statement-breakpoint
CREATE TYPE "estanterias"."trompo" AS ENUM('a', 'b');--> statement-breakpoint
CREATE TABLE "estanterias"."avisos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "estanterias"."tipo_aviso" NOT NULL,
	"tanda_id" integer,
	"tarjeta_id" integer,
	"texto" text NOT NULL,
	"usuario_id" integer NOT NULL,
	"usuario_nombre" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelto_en" timestamp with time zone,
	"resuelto_por" text,
	"resolucion" text
);
--> statement-breakpoint
CREATE TABLE "estanterias"."config" (
	"clave" text PRIMARY KEY NOT NULL,
	"valor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estanterias"."estanterias" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"modelo_id" integer NOT NULL,
	"familia_id" integer NOT NULL,
	"moldes" integer NOT NULL,
	"cemento" "estanterias"."cemento" DEFAULT 'gris' NOT NULL,
	"numero" integer,
	"activa" boolean DEFAULT true NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estanterias"."familias" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estanterias"."modelos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estanterias"."motivos_rotura" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estanterias"."movimientos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tanda_id" integer NOT NULL,
	"tanda_codigo" text NOT NULL,
	"tanda_palabra" text,
	"producto_nombre" text NOT NULL,
	"tipo" "estanterias"."tipo_movimiento" NOT NULL,
	"estado_desde" "estanterias"."estado_tanda",
	"estado_hasta" "estanterias"."estado_tanda" NOT NULL,
	"usuario_id" integer NOT NULL,
	"usuario_nombre" text NOT NULL,
	"duracion_min" integer,
	"trompo" "estanterias"."trompo",
	"moldes_llenados" integer,
	"paquetes" integer,
	"motivo_fraguado" "estanterias"."motivo_fraguado",
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estanterias"."productos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"modelo_id" integer NOT NULL,
	"familia_id" integer NOT NULL,
	"piezas_por_molde" integer DEFAULT 1 NOT NULL,
	"piezas_por_paquete" integer DEFAULT 1 NOT NULL,
	"requiere_tunel" boolean DEFAULT true NOT NULL,
	"cemento" "estanterias"."cemento" DEFAULT 'gris' NOT NULL,
	"m2_por_paquete" numeric(8, 4),
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estanterias"."reasignaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"estanteria_id" integer NOT NULL,
	"etiqueta_antes" text NOT NULL,
	"etiqueta_despues" text NOT NULL,
	"familia_antes" text NOT NULL,
	"familia_despues" text NOT NULL,
	"cemento_antes" "estanterias"."cemento" NOT NULL,
	"cemento_despues" "estanterias"."cemento" NOT NULL,
	"motivo" text NOT NULL,
	"usuario_id" integer NOT NULL,
	"usuario_nombre" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estanterias"."tandas" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"estanteria_id" integer,
	"producto_id" integer NOT NULL,
	"producto_nombre" text NOT NULL,
	"modelo_nombre" text NOT NULL,
	"familia_nombre" text NOT NULL,
	"piezas_por_molde" integer NOT NULL,
	"piezas_por_paquete" integer NOT NULL,
	"m2_por_paquete" numeric(8, 4),
	"trompo" "estanterias"."trompo" NOT NULL,
	"moldes_nominal" integer,
	"moldes_llenados" integer NOT NULL,
	"paquetes" integer,
	"motivo_rotura_id" integer,
	"motivo_rotura_nombre" text,
	"estado" "estanterias"."estado_tanda" DEFAULT 'patio' NOT NULL,
	"estado_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"estanteria_liberada_en" timestamp with time zone,
	"rehornear" boolean DEFAULT false NOT NULL,
	"cemento" "estanterias"."cemento" DEFAULT 'gris' NOT NULL,
	"estanteria_etiqueta" text,
	"tarjeta_id" integer,
	"tarjeta_palabra" text,
	"tarjeta_letra" text,
	"tarjeta_orden" integer,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estanterias"."tarjetas" (
	"id" serial PRIMARY KEY NOT NULL,
	"letra" text NOT NULL,
	"orden" integer NOT NULL,
	"palabra" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"perdida_desde" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "estanterias"."usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario" text NOT NULL,
	"nombre" text NOT NULL,
	"pin_hash" text NOT NULL,
	"rol" "estanterias"."rol" NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"intentos_fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "estanterias"."avisos" ADD CONSTRAINT "avisos_tanda_id_tandas_id_fk" FOREIGN KEY ("tanda_id") REFERENCES "estanterias"."tandas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estanterias"."avisos" ADD CONSTRAINT "avisos_tarjeta_id_tarjetas_id_fk" FOREIGN KEY ("tarjeta_id") REFERENCES "estanterias"."tarjetas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estanterias"."avisos" ADD CONSTRAINT "avisos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "estanterias"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estanterias"."estanterias" ADD CONSTRAINT "estanterias_modelo_id_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "estanterias"."modelos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estanterias"."estanterias" ADD CONSTRAINT "estanterias_familia_id_familias_id_fk" FOREIGN KEY ("familia_id") REFERENCES "estanterias"."familias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estanterias"."movimientos" ADD CONSTRAINT "movimientos_tanda_id_tandas_id_fk" FOREIGN KEY ("tanda_id") REFERENCES "estanterias"."tandas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estanterias"."movimientos" ADD CONSTRAINT "movimientos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "estanterias"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estanterias"."productos" ADD CONSTRAINT "productos_modelo_id_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "estanterias"."modelos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estanterias"."productos" ADD CONSTRAINT "productos_familia_id_familias_id_fk" FOREIGN KEY ("familia_id") REFERENCES "estanterias"."familias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estanterias"."reasignaciones" ADD CONSTRAINT "reasignaciones_estanteria_id_estanterias_id_fk" FOREIGN KEY ("estanteria_id") REFERENCES "estanterias"."estanterias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estanterias"."reasignaciones" ADD CONSTRAINT "reasignaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "estanterias"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estanterias"."tandas" ADD CONSTRAINT "tandas_estanteria_id_estanterias_id_fk" FOREIGN KEY ("estanteria_id") REFERENCES "estanterias"."estanterias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estanterias"."tandas" ADD CONSTRAINT "tandas_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "estanterias"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estanterias"."tandas" ADD CONSTRAINT "tandas_motivo_rotura_id_motivos_rotura_id_fk" FOREIGN KEY ("motivo_rotura_id") REFERENCES "estanterias"."motivos_rotura"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estanterias"."tandas" ADD CONSTRAINT "tandas_tarjeta_id_tarjetas_id_fk" FOREIGN KEY ("tarjeta_id") REFERENCES "estanterias"."tarjetas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "avisos_abiertos_idx" ON "estanterias"."avisos" USING btree ("resuelto_en");--> statement-breakpoint
CREATE UNIQUE INDEX "estanterias_codigo_idx" ON "estanterias"."estanterias" USING btree ("codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "estanterias_placa_idx" ON "estanterias"."estanterias" USING btree ("modelo_id","familia_id","numero");--> statement-breakpoint
CREATE INDEX "estanterias_modelo_familia_idx" ON "estanterias"."estanterias" USING btree ("modelo_id","familia_id","cemento");--> statement-breakpoint
CREATE INDEX "movimientos_tanda_idx" ON "estanterias"."movimientos" USING btree ("tanda_id");--> statement-breakpoint
CREATE INDEX "movimientos_creado_idx" ON "estanterias"."movimientos" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "movimientos_tipo_idx" ON "estanterias"."movimientos" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "productos_modelo_familia_idx" ON "estanterias"."productos" USING btree ("modelo_id","familia_id","cemento");--> statement-breakpoint
CREATE INDEX "reasignaciones_estanteria_idx" ON "estanterias"."reasignaciones" USING btree ("estanteria_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tandas_codigo_idx" ON "estanterias"."tandas" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "tandas_estado_idx" ON "estanterias"."tandas" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "tandas_producto_idx" ON "estanterias"."tandas" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "tandas_creada_idx" ON "estanterias"."tandas" USING btree ("creada_en");--> statement-breakpoint
CREATE UNIQUE INDEX "tandas_estanteria_retenida_idx" ON "estanterias"."tandas" USING btree ("estanteria_id") WHERE estado in ('patio', 'horno', 'a_desmoldar');--> statement-breakpoint
CREATE UNIQUE INDEX "tandas_tarjeta_en_uso_idx" ON "estanterias"."tandas" USING btree ("tarjeta_id") WHERE estado <> 'listo';--> statement-breakpoint
CREATE UNIQUE INDEX "tarjetas_letra_orden_idx" ON "estanterias"."tarjetas" USING btree ("letra","orden");--> statement-breakpoint
CREATE UNIQUE INDEX "tarjetas_palabra_idx" ON "estanterias"."tarjetas" USING btree ("palabra");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_usuario_idx" ON "estanterias"."usuarios" USING btree ("usuario");