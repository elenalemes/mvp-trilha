-- ----------------------------------------------------------------------------
-- Sprint 3.3 · Proposta — o pedido que vira negócio
-- ----------------------------------------------------------------------------
-- Até aqui o sistema só CALCULAVA. O simulador refaz a conta a cada visita, e
-- está certo que refaça: se a incorporadora muda o preço, a simulação muda
-- junto.
--
-- A proposta não pode. Ela CONGELA. Guarda a própria cópia do valor do imóvel,
-- da condição escolhida e do percentual de comissão do dia. Se a proposta
-- recalculasse, o cliente aceitaria um número e assinaria outro.
--
-- É por isso que este arquivo duplica dado de propósito — a única duplicação
-- defensável neste banco.
--
-- REGRAS (definidas com o Matheus entre 9 e 14/set):
--
--   * QUEM APROVA É A TRILHA. Formato de pagamento e qualificação do
--     comprador. A incorporadora NÃO aprova negócio.
--   * Enviar proposta não trava nada. Dois corretores podem propor a mesma
--     unidade — isso acontece no mundo real.
--   * ACEITAR trava: o imóvel vai para `em_negociacao` e as outras propostas
--     abertas daquela unidade viram `invalidada`. Como a policy do parceiro em
--     `imovel` já exige `status = 'disponivel'`, a unidade some do simulador
--     sozinha. Nenhuma trava nova, nenhuma tela para lembrar da regra.
--   * `recusada` e `invalidada` são coisas diferentes: recusada é uma decisão
--     sobre aquela proposta; invalidada é "a unidade foi para outro". O
--     corretor merece saber qual das duas aconteceu com ele.
--   * A INCORPORADORA vê a proposta desde que chega — unidade, corretor,
--     condição, status — mas NÃO vê o comprador. Depois de aceita, vê apenas o
--     NOME dele. Nunca CPF, e-mail ou telefone.
--   * Cancelar a negociação devolve o imóvel para `disponivel`. As propostas
--     invalidadas NÃO ressuscitam: os números delas são de outro dia.
--
-- O `negocio` e o checklist de fechamento NÃO estão aqui. São o próximo ciclo.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · Os estados da proposta
--
-- Tipos NOVOS podem ser criados e usados na mesma transação — a proibição do
-- Postgres é sobre usar um valor recém-adicionado a um enum que já existia.
-- Por isso `imovel_status` não é tocado aqui: `em_negociacao` e `disponivel`
-- já existem desde a sprint 1.
--
-- `cancelada` já entra agora mesmo sem uso neste ciclo: é o estado da proposta
-- cujo negócio caiu depois (crédito reprovado, distrato). Deixar o valor
-- pronto evita um `alter type` no meio do ciclo do fechamento — e alter type
-- em enum é exatamente o que não se quer fazer com pressa.
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'proposta_status') then
    create type public.proposta_status as enum (
      'enviada',      -- chegou, ninguém olhou ainda
      'em_analise',   -- a Trilha pegou para analisar
      'aceita',       -- vira negócio; trava a unidade
      'recusada',     -- decisão sobre ESTA proposta
      'invalidada',   -- a unidade foi para outra proposta
      'cancelada'     -- era negócio e caiu (crédito reprovado, distrato)
    );
  end if;
end $$;

-- De qual escopo saiu a condição escolhida. Guardado junto com os números
-- porque a mesma pergunta seis meses depois não tem outra resposta possível:
-- a opção pode ter sido editada ou apagada desde então.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'proposta_escopo') then
    create type public.proposta_escopo as enum ('incorporadora', 'empreendimento');
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- PARTE 2 · O comprador
--
-- Tabela própria, e não colunas dentro da proposta, por dois motivos:
--
--   1. o Matheus pediu um item "Compradores" no painel da Trilha — quem fechou
--      negócio fica salvo. Isso só existe se o comprador for entidade.
--   2. é o que permite a incorporadora enxergar a proposta sem enxergar o
--      comprador. Dado pessoal separado é dado pessoal que dá para não
--      mostrar.
--
-- O CPF é único: o mesmo comprador propondo duas unidades é a MESMA pessoa,
-- não duas fichas. Guardado só com dígitos, como o resto do sistema.
-- ----------------------------------------------------------------------------

create table if not exists public.comprador (
  id          uuid primary key default gen_random_uuid(),

  nome        text not null,
  cpf         text not null,
  email       text not null,
  telefone    text not null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.comprador is
  'Quem compra. Dado pessoal: só a Trilha lê esta tabela inteira. A incorporadora nunca a alcança.';

create unique index if not exists comprador_cpf_unico on public.comprador (cpf);
create index if not exists comprador_nome_idx on public.comprador (nome);

drop trigger if exists comprador_touch on public.comprador;
create trigger comprador_touch before update on public.comprador
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- PARTE 3 · A proposta
--
-- O bloco de números congelados é o coração da tabela. Cada coluna é uma cópia
-- do que `calcularCondicao` devolveu no dia — os mesmos nomes da TypeScript, em
-- snake_case, para ninguém precisar traduzir de cabeça.
--
-- `condicao` guarda o objeto inteiro em jsonb: as colunas servem para listar e
-- somar sem abrir o json, o json serve para reconstruir a tela exata que o
-- cliente viu. Um é para o banco trabalhar, o outro é para a verdade.
--
-- `imovel_id` é `restrict`: apagar uma unidade que tem proposta é quase sempre
-- engano, e o banco deve dizer isso em vez de levar o histórico junto.
-- ----------------------------------------------------------------------------

create sequence if not exists public.proposta_codigo_seq;

create table if not exists public.proposta (
  id                    uuid primary key default gen_random_uuid(),

  -- Curto e legível, para citar no WhatsApp: PRP-0001.
  codigo                text not null unique
                          default ('PRP-' || lpad(nextval('public.proposta_codigo_seq')::text, 4, '0')),

  imovel_id             uuid not null references public.imovel (id) on delete restrict,

  -- Redundantes em relação ao imóvel, e de propósito: são o que as policies
  -- comparam. Sem eles toda leitura viraria duas junções, em toda tela.
  empreendimento_id     uuid not null references public.empreendimento (id) on delete restrict,
  incorporadora_id      uuid not null references public.incorporadora (id) on delete restrict,

  -- Quem vendeu. Nasce PENDENTE quando o corretor ainda não tem cadastro.
  parceiro_id           uuid not null references public.parceiro (id) on delete restrict,
  comprador_id          uuid not null references public.comprador (id) on delete restrict,

  status                public.proposta_status not null default 'enviada',

  -- ------------------------------------------------------------------ números
  valor_imovel          numeric(14,2) not null,   -- valor da unidade no dia
  escopo                public.proposta_escopo not null,
  opcao_pagamento_id    uuid references public.opcao_pagamento (id) on delete set null,

  prazo_meses           integer       not null,
  percentual_ato        numeric(5,2)  not null,
  percentual_entrada    numeric(5,2)  not null,
  percentual_comissao   numeric(5,2)  not null,

  valor_base            numeric(14,2) not null,   -- valor final do imóvel
  valor_ato             numeric(14,2) not null,
  valor_parcela         numeric(14,2) not null,
  valor_entrada         numeric(14,2) not null,
  valor_saldo           numeric(14,2) not null,

  condicao              jsonb         not null,   -- o objeto Condicao inteiro

  -- ---------------------------------------------------------------- decisão
  observacao            text,                     -- o corretor conta o contexto
  motivo_decisao        text,                     -- a Trilha diz por quê
  decidida_em           timestamptz,
  decidida_por          uuid references public.conta (id) on delete set null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.proposta is
  'Pedido de negócio numa unidade, com os números congelados do dia. Quem aceita é a Trilha.';

create index if not exists proposta_imovel_idx          on public.proposta (imovel_id);
create index if not exists proposta_incorporadora_idx   on public.proposta (incorporadora_id);
create index if not exists proposta_parceiro_idx        on public.proposta (parceiro_id);
create index if not exists proposta_comprador_idx       on public.proposta (comprador_id);
create index if not exists proposta_status_idx          on public.proposta (status, created_at desc);

-- Uma unidade tem no máximo UMA proposta aceita. Índice parcial: enquanto
-- estão abertas podem ser quantas forem, e é isso que se quer.
create unique index if not exists proposta_uma_aceita_por_imovel
  on public.proposta (imovel_id)
  where status = 'aceita';

drop trigger if exists proposta_touch on public.proposta;
create trigger proposta_touch before update on public.proposta
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- PARTE 4 · Quem é o parceiro logado
--
-- Irmã de `minha_incorporadora_como_parceiro()`. Devolve nulo para quem não é
-- parceiro — e nulo não casa com coluna nenhuma, que é o que faz as policies
-- abaixo não valerem para mais ninguém.
-- ----------------------------------------------------------------------------

create or replace function public.meu_parceiro_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.parceiro where conta_id = auth.uid() and ativo;
$$;

grant execute on function public.meu_parceiro_id() to authenticated;


-- ----------------------------------------------------------------------------
-- PARTE 5 · Quem lê o quê
--
-- A proposta NASCE pelo servidor, com a chave de administrador. Não existe
-- policy de insert para ninguém, e isso é intencional: quem envia proposta
-- pelo simulador público não tem identidade nenhuma no banco — é `anon`, que
-- não pode nada. A validação mora na server action, do mesmo jeito que a
-- leitura pública mora em `lib/simulador.ts`.
--
-- A INCORPORADORA não tem policy alguma aqui. Ela lê pela view da Parte 6, que
-- é a única porta dela. Regra em um lugar só é regra que não se contorna
-- chamando a API direto.
-- ----------------------------------------------------------------------------

alter table public.comprador enable row level security;
alter table public.proposta  enable row level security;

grant select, insert, update, delete on public.comprador to authenticated;
grant select, insert, update, delete on public.proposta  to authenticated;
grant all on public.comprador to service_role;
grant all on public.proposta  to service_role;
grant usage, select on sequence public.proposta_codigo_seq to service_role;

-- A Trilha faz tudo. É ela quem decide.
drop policy if exists proposta_admin on public.proposta;
create policy proposta_admin on public.proposta
  for all to authenticated
  using (public.eh_admin_trilha())
  with check (public.eh_admin_trilha());

drop policy if exists comprador_admin on public.comprador;
create policy comprador_admin on public.comprador
  for all to authenticated
  using (public.eh_admin_trilha())
  with check (public.eh_admin_trilha());

-- O corretor lê as propostas que ele mesmo enviou, e nada mais. Não edita:
-- proposta enviada não se conserta, se envia outra.
drop policy if exists proposta_do_parceiro on public.proposta;
create policy proposta_do_parceiro on public.proposta
  for select to authenticated
  using (parceiro_id = public.meu_parceiro_id());

-- E lê os compradores que ele mesmo cadastrou — foi ele quem digitou.
drop policy if exists comprador_do_parceiro on public.comprador;
create policy comprador_do_parceiro on public.comprador
  for select to authenticated
  using (exists (
    select 1 from public.proposta p
    where p.comprador_id = comprador.id
      and p.parceiro_id = public.meu_parceiro_id()
  ));


-- ----------------------------------------------------------------------------
-- PARTE 6 · A porta da incorporadora
--
-- View com SECURITY DEFINER de propósito (`security_invoker = false`): ela
-- ignora a RLS das tabelas de baixo e aplica o recorte aqui, o que é o ponto —
-- a incorporadora NÃO tem policy em `proposta` nem em `comprador`, então esta
-- view é literalmente o único caminho dela até o dado.
--
-- O `case` do nome é a regra de privacidade escrita no banco: enquanto a
-- proposta não é aceita, o nome do comprador vem NULO. CPF, e-mail e telefone
-- não estão na view de jeito nenhum — nem depois de aceita.
--
-- O linter do Supabase marca views definer como aviso. Aqui é intencional.
-- ----------------------------------------------------------------------------

drop view if exists public.proposta_da_incorporadora;

create view public.proposta_da_incorporadora
with (security_invoker = false) as
select
  p.id,
  p.codigo,
  p.status,
  p.imovel_id,
  p.empreendimento_id,
  p.incorporadora_id,
  i.identificacao      as unidade,
  e.nome               as empreendimento,
  pa.nome              as parceiro,
  pa.creci             as parceiro_creci,

  -- Só o nome, e só depois de aceita.
  case when p.status = 'aceita' then c.nome end as comprador_nome,

  p.valor_imovel,
  p.prazo_meses,
  p.percentual_ato,
  p.percentual_entrada,
  p.percentual_comissao,
  p.valor_base,
  p.valor_ato,
  p.valor_parcela,
  p.valor_entrada,
  p.valor_saldo,
  p.condicao,

  p.decidida_em,
  p.created_at
from public.proposta p
  join public.imovel          i  on i.id  = p.imovel_id
  join public.empreendimento  e  on e.id  = p.empreendimento_id
  join public.parceiro        pa on pa.id = p.parceiro_id
  join public.comprador       c  on c.id  = p.comprador_id
where p.incorporadora_id = public.minha_incorporadora_id();

comment on view public.proposta_da_incorporadora is
  'O que a incorporadora enxerga das propostas das unidades dela. Sem CPF, e-mail ou telefone; o nome só depois de aceita.';

grant select on public.proposta_da_incorporadora to authenticated;


-- ----------------------------------------------------------------------------
-- PARTE 7 · Aceitar
--
-- Três escritas que não podem acontecer pela metade: decidir a proposta,
-- travar a unidade, invalidar as concorrentes. Numa função só, numa transação
-- só — a mesma lição de `aplicar_importacao`.
--
-- `security definer` porque ela escreve em `imovel` e em propostas de outros
-- parceiros. A checagem de quem pode chamar está na primeira linha do corpo, e
-- não na policy: só o admin da Trilha aceita proposta.
-- ----------------------------------------------------------------------------

create or replace function public.aceitar_proposta(
  p_proposta uuid,
  p_motivo   text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_imovel  uuid;
  v_status  public.proposta_status;
begin
  if not public.eh_admin_trilha() then
    raise exception 'Só a Trilha aceita proposta.' using errcode = '42501';
  end if;

  select imovel_id, status into v_imovel, v_status
  from public.proposta where id = p_proposta
  for update;

  if v_imovel is null then
    raise exception 'Proposta não encontrada.' using errcode = 'P0002';
  end if;

  if v_status not in ('enviada', 'em_analise') then
    raise exception 'Esta proposta está como %, não dá para aceitar.', v_status
      using errcode = '22023';
  end if;

  -- A unidade tem que estar à venda. Se outra proposta foi aceita no meio do
  -- caminho, é aqui que se descobre.
  if not exists (
    select 1 from public.imovel where id = v_imovel and status = 'disponivel'
  ) then
    raise exception 'Esta unidade não está mais disponível.' using errcode = '22023';
  end if;

  update public.proposta
     set status = 'aceita', motivo_decisao = p_motivo,
         decidida_em = now(), decidida_por = auth.uid()
   where id = p_proposta;

  update public.imovel
     set status = 'em_negociacao'
   where id = v_imovel;

  -- As outras saem de cena. `invalidada`, não `recusada`: ninguém julgou o
  -- mérito delas, a unidade é que foi embora.
  update public.proposta
     set status = 'invalidada', decidida_em = now(), decidida_por = auth.uid()
   where imovel_id = v_imovel
     and id <> p_proposta
     and status in ('enviada', 'em_analise');
end;
$$;

revoke all on function public.aceitar_proposta(uuid, text) from public;
grant execute on function public.aceitar_proposta(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- PARTE 8 · Recusar
--
-- Sem efeito colateral nenhum: a unidade continua à venda, as outras propostas
-- continuam vivas. É só uma decisão sobre esta.
-- ----------------------------------------------------------------------------

create or replace function public.recusar_proposta(
  p_proposta uuid,
  p_motivo   text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin_trilha() then
    raise exception 'Só a Trilha recusa proposta.' using errcode = '42501';
  end if;

  update public.proposta
     set status = 'recusada', motivo_decisao = p_motivo,
         decidida_em = now(), decidida_por = auth.uid()
   where id = p_proposta
     and status in ('enviada', 'em_analise');

  if not found then
    raise exception 'Proposta não encontrada ou já decidida.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.recusar_proposta(uuid, text) from public;
grant execute on function public.recusar_proposta(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'estados da proposta' as item,
       string_agg(e.enumlabel::text, ' | ' order by e.enumsortorder) as situacao
from pg_type t join pg_enum e on e.enumtypid = t.oid
where t.typname = 'proposta_status'

union all

select 'tabela comprador',
       coalesce(string_agg(column_name, ', ' order by ordinal_position), 'NÃO EXISTE')
from information_schema.columns
where table_schema = 'public' and table_name = 'comprador'

union all

select 'tabela proposta',
       coalesce(string_agg(column_name, ', ' order by ordinal_position), 'NÃO EXISTE')
from information_schema.columns
where table_schema = 'public' and table_name = 'proposta'

union all

select 'view da incorporadora',
       coalesce(string_agg(column_name, ', ' order by ordinal_position), 'NÃO EXISTE')
from information_schema.columns
where table_schema = 'public' and table_name = 'proposta_da_incorporadora'

union all

select 'funções novas',
       coalesce(string_agg(p.oid::regprocedure::text, ' | ' order by p.proname), 'NENHUMA')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('meu_parceiro_id', 'aceitar_proposta', 'recusar_proposta')

union all

select 'policies da proposta',
       coalesce(string_agg(polrelid::regclass::text || '.' || polname, ' | '
                order by polrelid::regclass::text, polname), 'NENHUMA')
from pg_policy
where polrelid in ('public.proposta'::regclass, 'public.comprador'::regclass);
