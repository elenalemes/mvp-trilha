-- ----------------------------------------------------------------------------
-- Sprint 3.5 · Convite de primeiro acesso do parceiro
-- ----------------------------------------------------------------------------
-- MUDANÇA DE REGRA, decidida em 22/set: o corretor que envia proposta pelo
-- simulador não espera mais aprovação. O cadastro nasce ATIVO e ele recebe um
-- link de primeiro acesso no WhatsApp.
--
-- O argumento que sustentava a aprovação manual não se sustentava: dizia-se
-- que conta automática abriria o estoque para qualquer um — só que o simulador
-- JÁ é público e mostra todo o estoque, todas as unidades e todas as condições,
-- sem login. O que o painel do parceiro mostra a mais é o percentual de
-- comissão dele.
--
-- O que continua valendo é outra coisa: não se manda senha para um e-mail ou
-- telefone que ninguém verificou. Por isso o LOGIN não nasce junto com o
-- cadastro. Nasce quando alguém usa o link — e usar o link é a prova de que
-- aquele WhatsApp é mesmo dele.
--
-- Enquanto ninguém clica, não existe usuário de autenticação nenhum. Um script
-- disparando propostas falsas cria linhas em `parceiro`, que a Trilha apaga;
-- não cria logins.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------

alter table public.parceiro
  add column if not exists convite_token     text,
  add column if not exists convite_expira_em timestamptz,
  add column if not exists convite_enviado_em timestamptz,
  add column if not exists convite_canal     text;

comment on column public.parceiro.convite_token is
  'Token de primeiro acesso. Queimado assim que o login é criado — presente aqui significa convite em aberto.';
comment on column public.parceiro.convite_expira_em is
  'Prazo do convite (7 dias). Link vazado não vale para sempre.';
comment on column public.parceiro.convite_canal is
  'Por onde o convite saiu, e se saiu: whatsapp, email, ou nulo quando nenhum envio deu certo.';

-- Único porque é por ele que a página pública encontra o parceiro. Parcial
-- porque a coluna é nula na imensa maioria das linhas — quem já entrou não tem
-- convite em aberto.
create unique index if not exists parceiro_convite_token_idx
  on public.parceiro (convite_token)
  where convite_token is not null;

-- A fila do que foi convidado e ainda não entrou. É a lista que diz se o
-- WhatsApp está chegando.
create index if not exists parceiro_convite_pendente_idx
  on public.parceiro (incorporadora_id, convite_expira_em)
  where convite_token is not null;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'colunas do convite' as item,
       coalesce(string_agg(column_name, ', ' order by column_name), 'NÃO EXISTEM') as situacao
from information_schema.columns
where table_schema = 'public' and table_name = 'parceiro'
  and column_name like 'convite%'

union all

select 'índices do convite',
       coalesce(string_agg(indexname, ' | ' order by indexname), 'NENHUM')
from pg_indexes
where schemaname = 'public' and tablename = 'parceiro' and indexname like '%convite%'

union all

select 'parceiros com convite em aberto',
       count(*)::text
from public.parceiro
where convite_token is not null;
