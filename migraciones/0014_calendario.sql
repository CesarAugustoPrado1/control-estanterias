-- 0014 · Calendario de dias habiles.
--
-- Por defecto se trabaja de lunes a viernes. Esta tabla guarda solo las
-- EXCEPCIONES: los feriados nacionales (no se trabaja), un sabado o un feriado
-- que se decide trabajar, o un dia de semana que no se trabaja (vacaciones).
-- Si un dia tiene fila, manda la fila; si no, la regla de lunes a viernes.
--
-- Se usa para sugerir el dia de desmolde en el programa: el primer dia HABIL
-- despues del tiempo minimo de desmolde.
--
-- Vienen cargados los feriados nacionales 2026-2028 (con los trasladables ya
-- movidos segun la ley 27.399). Los "dias no laborables" (puentes turisticos,
-- Jueves Santo) quedan cargados como dias que SE TRABAJAN: no son feriados, y
-- con un toque en Admin > Calendario se marcan como no habiles. Los puentes de
-- 2027 en adelante los fija un decreto cada ano: hay que agregarlos a mano.

CREATE TABLE IF NOT EXISTS estanterias.calendario (
  dia date PRIMARY KEY,
  laborable boolean NOT NULL,
  nombre text,
  actualizado_por text,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO estanterias.calendario (dia, laborable, nombre) VALUES
  ('2026-01-01', false, 'Año Nuevo'),
  ('2026-02-16', false, 'Carnaval'),
  ('2026-02-17', false, 'Carnaval'),
  ('2026-03-23', true, 'Día no laborable con fines turísticos (puente)'),
  ('2026-03-24', false, 'Día Nacional de la Memoria por la Verdad y la Justicia'),
  ('2026-04-02', false, 'Día del Veterano y de los Caídos en la Guerra de Malvinas'),
  ('2026-04-03', false, 'Viernes Santo'),
  ('2026-05-01', false, 'Día del Trabajador'),
  ('2026-05-25', false, 'Día de la Revolución de Mayo'),
  ('2026-06-15', false, 'Paso a la Inmortalidad del General Don Martín Miguel de Güemes'),
  ('2026-06-20', false, 'Paso a la Inmortalidad del General D. Manuel Belgrano'),
  ('2026-07-09', false, 'Día de la Independencia'),
  ('2026-07-10', true, 'Día no laborable con fines turísticos (puente)'),
  ('2026-08-17', false, 'Paso a la Inmortalidad del General José de San Martín'),
  ('2026-10-12', false, 'Día del Respeto a la Diversidad Cultural'),
  ('2026-11-23', false, 'Día de la Soberanía Nacional'),
  ('2026-12-07', true, 'Día no laborable con fines turísticos (puente)'),
  ('2026-12-08', false, 'Inmaculada Concepción de María'),
  ('2026-12-25', false, 'Navidad'),
  ('2027-01-01', false, 'Año Nuevo'),
  ('2027-02-08', false, 'Carnaval'),
  ('2027-02-09', false, 'Carnaval'),
  ('2027-03-24', false, 'Día Nacional de la Memoria por la Verdad y la Justicia'),
  ('2027-03-25', true, 'Jueves Santo (día no laborable)'),
  ('2027-03-26', false, 'Viernes Santo'),
  ('2027-04-02', false, 'Día del Veterano y de los Caídos en la Guerra de Malvinas'),
  ('2027-05-01', false, 'Día del Trabajador'),
  ('2027-05-25', false, 'Día de la Revolución de Mayo'),
  ('2027-06-20', false, 'Paso a la Inmortalidad del General D. Manuel Belgrano'),
  ('2027-06-21', false, 'Paso a la Inmortalidad del General Don Martín Miguel de Güemes'),
  ('2027-07-09', false, 'Día de la Independencia'),
  ('2027-08-16', false, 'Paso a la Inmortalidad del General José de San Martín'),
  ('2027-10-11', false, 'Día del Respeto a la Diversidad Cultural'),
  ('2027-11-20', false, 'Día de la Soberanía Nacional'),
  ('2027-12-08', false, 'Inmaculada Concepción de María'),
  ('2027-12-25', false, 'Navidad'),
  ('2028-01-01', false, 'Año Nuevo'),
  ('2028-02-28', false, 'Carnaval'),
  ('2028-02-29', false, 'Carnaval'),
  ('2028-03-24', false, 'Día Nacional de la Memoria por la Verdad y la Justicia'),
  ('2028-04-02', false, 'Día del Veterano y de los Caídos en la Guerra de Malvinas'),
  ('2028-04-13', true, 'Jueves Santo (día no laborable)'),
  ('2028-04-14', false, 'Viernes Santo'),
  ('2028-05-01', false, 'Día del Trabajador'),
  ('2028-05-25', false, 'Día de la Revolución de Mayo'),
  ('2028-06-17', false, 'Paso a la Inmortalidad del General Don Martín Miguel de Güemes'),
  ('2028-06-20', false, 'Paso a la Inmortalidad del General D. Manuel Belgrano'),
  ('2028-07-09', false, 'Día de la Independencia'),
  ('2028-08-21', false, 'Paso a la Inmortalidad del General José de San Martín'),
  ('2028-10-16', false, 'Día del Respeto a la Diversidad Cultural'),
  ('2028-11-20', false, 'Día de la Soberanía Nacional'),
  ('2028-12-08', false, 'Inmaculada Concepción de María'),
  ('2028-12-25', false, 'Navidad')
ON CONFLICT (dia) DO NOTHING;
