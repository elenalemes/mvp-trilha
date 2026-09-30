-- ----------------------------------------------------------------------------
-- Sprint 6.1 · Dados sensíveis da incorporadora/proprietário fora do alcance
-- ----------------------------------------------------------------------------
-- Rode depois de todos os anteriores.
--
-- O corretor precisa ler a linha da incorporadora das propostas dele (nome,
-- comissão). Só que RLS libera a LINHA inteira: junto vinham CPF, RG, estado
-- civil e endereço do responsável e os dados bancários — e, no proprietário
-- PF, os dados pessoais dele.
--
-- A trava agora é por COLUNA: quem está logado lê só as colunas de contato e
-- de negócio. As sensíveis saem do alcance de qualquer consulta pelo cliente
-- do navegador; o app lê essas colunas pelo servidor, e só nas telas da
-- Trilha e do próprio dono (ficha, perfil, fechamento).
--
-- Escrita não muda: continua valendo o que as policies de UPDATE já dizem.
--
-- Rodar inteiro no SQL Editor do Supabase. Não apaga dados.
-- ----------------------------------------------------------------------------

revoke select on public.incorporadora from authenticated, anon;

grant select (
  id, conta_id, tipo,
  nome, cnpj, email, telefone, endereco,
  resp_nome, resp_cargo, resp_email, resp_telefone,
  percentual_comissao,
  created_at, updated_at
) on public.incorporadora to authenticated;

-- No proprietário PF, `endereco` repetia o endereço pessoal dele. Deixa de
-- repetir (o endereço pessoal continua em `resp_endereco`, protegido).
update public.incorporadora
   set endereco = null
 where tipo = 'proprietario_pf'
   and endereco is not null;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'colunas protegidas (sem leitura para quem está logado)' as item,
       string_agg(c.column_name, ', ' order by c.ordinal_position) as situacao
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'incorporadora'
  and not has_column_privilege('authenticated', 'public.incorporadora', c.column_name, 'SELECT');
