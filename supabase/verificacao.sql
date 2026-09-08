-- ============================================================================
-- VERIFICACAO · rode SEPARADO dos scripts que alteram o banco.
-- Somente leitura.
-- ============================================================================

-- Os seis precisam vir true.
select
  has_schema_privilege('authenticated', 'public', 'USAGE')           as auth_usa_schema,
  has_table_privilege ('authenticated', 'public.conta',  'SELECT')   as auth_le_conta,
  has_table_privilege ('authenticated', 'public.imovel', 'INSERT')   as auth_grava_imovel,
  has_schema_privilege('service_role',  'public', 'USAGE')           as servidor_usa_schema,
  has_table_privilege ('service_role',  'public.conta', 'INSERT')    as servidor_grava_conta,
  has_table_privilege ('service_role',  'public.incorporadora', 'INSERT') as servidor_grava_inc;

-- Quem esta cadastrado
select u.email as usuario_auth, c.tipo as papel
from auth.users u
left join public.conta c on c.id = u.id;

-- Regras de acesso ativas
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
