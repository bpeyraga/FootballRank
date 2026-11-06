-- Código corto opcional (estilo FIFA, 2-3 caracteres) para mostrar las stats de la casa en el radar.
-- Si es null, el front genera uno automático a partir del nombre.
alter table custom_stats add column if not exists code text;
alter table custom_stats drop constraint if exists custom_stats_code_check;
alter table custom_stats add constraint custom_stats_code_check
  check (code is null or code ~ '^[A-ZÑ0-9]{2,3}$');
