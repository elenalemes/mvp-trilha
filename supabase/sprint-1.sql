-- ============================================================================
-- Trilha · MVP Incorporadoras — SPRINT 1
--
-- Escopo: login do admin da Trilha, cadastro de incorporadoras (com acesso
-- próprio), empreendimentos e imóveis.
--
-- ATENÇÃO: a Parte 1 APAGA todas as tabelas do schema `public`. Rode apenas
-- se o banco não tem dado que você queira manter. O schema anterior está
-- guardado em `supabase/schema-completo-referencia.sql`.
--
-- Usuários do Supabase Auth NÃO são apagados — seu login continua valendo.
--
-- Rode este arquivo inteiro, de uma vez, no SQL Editor.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PARTE 1 · Limpar o schema anterior
-- ----------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;

  for r in select t.typname from pg_type t
           where t.typnamespace = 'public'::regnamespace and t.typtype = 'e' loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- PARTE 2 · Listas de valores fixos
-- ----------------------------------------------------------------------------

create type public.conta_tipo      as enum ('trilha_admin', 'incorporadora');
create type public.chave_pix_tipo  as enum ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria');
create type public.imovel_tipo     as enum ('apartamento', 'casa', 'sala_comercial', 'terreno', 'outro');
create type public.imovel_status   as enum ('disponivel', 'reservado', 'em_negociacao', 'vendido', 'indisponivel');


-- ----------------------------------------------------------------------------
-- PARTE 3 · Tabelas
-- ----------------------------------------------------------------------------

-- Quem faz login. Espelha o usuário do Supabase Auth e diz o papel dele.
create table public.conta (
  id          uuid primary key references auth.users (id) on delete cascade,
  tipo        public.conta_tipo not null,
  nome        text not null,
  email       text,
  telefone    text,
  created_at  timestamptz not null default now()
);

-- A empresa parceira: dados da empresa, do responsável e bancários.
create table public.incorporadora (
  id                  uuid primary key default gen_random_uuid(),
  conta_id            uuid unique references public.conta (id) on delete set null,

  nome                text not null,
  cnpj                text not null unique,
  email               text not null,
  telefone            text not null,
  endereco            text,

  resp_nome           text not null,
  resp_cpf            text not null,
  resp_rg             text,
  resp_profissao      text,
  resp_cargo          text,
  resp_estado_civil   text,
  resp_email          text not null,
  resp_telefone       text not null,
  resp_endereco       text,

  banco               text,
  agencia             text,
  conta_numero        text,
  chave_pix           text,
  chave_pix_tipo      public.chave_pix_tipo,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- O prédio ou condomínio. Sempre pertence a uma incorporadora.
create table public.empreendimento (
  id                uuid primary key default gen_random_uuid(),
  incorporadora_id  uuid not null references public.incorporadora (id) on delete cascade,
  nome              text not null,
  endereco          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- A unidade à venda. Sempre pertence a um empreendimento.
create table public.imovel (
  id                 uuid primary key default gen_random_uuid(),
  empreendimento_id  uuid not null references public.empreendimento (id) on delete cascade,

  identificacao      text not null,
  numero_matricula   text,
  tipo               public.imovel_tipo not null default 'apartamento',
  status             public.imovel_status not null default 'disponivel',

  valor              numeric(14, 2),
  -- Valorização da jornada: 0,42% ao mês, compostos, por 24 meses. Coluna
  -- gerada — o banco recalcula sozinho a cada gravação de `valor`, ninguém
  -- escreve nela. Espelho em src/lib/trilha.ts.
  valor_reajustado   numeric(14, 2)
    generated always as (round(valor * power(1.0042::numeric, 24), 2)) stored,
  metros_quadrados   numeric(8, 2),
  posicao_solar      text,

  num_quartos        integer,
  num_suites         integer,
  num_banheiros      integer,
  num_vagas          integer,
  matricula_vaga     text,

  sacada             boolean not null default false,
  churrasqueira      boolean not null default false,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index incorporadora_nome_idx    on public.incorporadora (nome);
create index empreendimento_inc_idx    on public.empreendimento (incorporadora_id);
create index imovel_empreendimento_idx on public.imovel (empreendimento_id);
create index imovel_status_idx         on public.imovel (status);

-- Duas unidades não podem ter a mesma identificação no mesmo empreendimento.
create unique index imovel_identificacao_unica
  on public.imovel (empreendimento_id, lower(identificacao));


-- ----------------------------------------------------------------------------
-- PARTE 4 · updated_at automático
-- ----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger incorporadora_touch   before update on public.incorporadora
  for each row execute function public.touch_updated_at();
create trigger empreendimento_touch  before update on public.empreendimento
  for each row execute function public.touch_updated_at();
create trigger imovel_touch          before update on public.imovel
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- PARTE 5 · Quem é o usuário logado
--
-- Estas duas funções respondem, para cada requisição: "esse usuário é admin
-- da Trilha?" e "de qual incorporadora ele é?". As regras de acesso abaixo
-- se apoiam nelas.
-- ----------------------------------------------------------------------------

create or replace function public.eh_admin_trilha()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conta
    where id = auth.uid() and tipo = 'trilha_admin'
  );
$$;

create or replace function public.minha_incorporadora_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.incorporadora where conta_id = auth.uid();
$$;


-- ----------------------------------------------------------------------------
-- PARTE 6 · Regras de acesso (RLS)
--
-- Admin da Trilha enxerga e mexe em tudo.
-- Incorporadora enxerga e mexe apenas no que é dela.
-- ----------------------------------------------------------------------------

alter table public.conta           enable row level security;
alter table public.incorporadora   enable row level security;
alter table public.empreendimento  enable row level security;
alter table public.imovel          enable row level security;

-- conta: cada um lê a própria; admin lê todas.
create policy conta_leitura on public.conta
  for select to authenticated
  using (id = auth.uid() or public.eh_admin_trilha());

-- incorporadora: admin faz tudo; a incorporadora lê a própria ficha.
create policy incorporadora_admin on public.incorporadora
  for all to authenticated
  using (public.eh_admin_trilha()) with check (public.eh_admin_trilha());

create policy incorporadora_propria on public.incorporadora
  for select to authenticated
  using (conta_id = auth.uid());

-- empreendimento: admin faz tudo; a incorporadora faz tudo nos dela.
create policy empreendimento_admin on public.empreendimento
  for all to authenticated
  using (public.eh_admin_trilha()) with check (public.eh_admin_trilha());

create policy empreendimento_proprio on public.empreendimento
  for all to authenticated
  using (incorporadora_id = public.minha_incorporadora_id())
  with check (incorporadora_id = public.minha_incorporadora_id());

-- imovel: admin faz tudo; a incorporadora faz tudo nos empreendimentos dela.
create policy imovel_admin on public.imovel
  for all to authenticated
  using (public.eh_admin_trilha()) with check (public.eh_admin_trilha());

create policy imovel_proprio on public.imovel
  for all to authenticated
  using (exists (
    select 1 from public.empreendimento e
    where e.id = imovel.empreendimento_id
      and e.incorporadora_id = public.minha_incorporadora_id()
  ))
  with check (exists (
    select 1 from public.empreendimento e
    where e.id = imovel.empreendimento_id
      and e.incorporadora_id = public.minha_incorporadora_id()
  ));


-- Permissão básica de acesso ao schema.
--
-- RLS e permissão são camadas diferentes: a permissão responde "esse tipo de
-- usuário pode olhar para esta tabela?" e vem ANTES da policy, que responde
-- "quais linhas ele vê?". Sem a permissão, o Postgres barra na porta com
-- "permission denied for schema public" e nem chega a avaliar a policy.
--
-- O Supabase concede isso por padrão em projetos novos, mas o `drop` da
-- Parte 1 levou junto — por isso precisamos recriar explicitamente.

-- São três papéis, e esquecer qualquer um quebra uma parte diferente do app:
--   anon           · visitante não logado
--   authenticated  · usuário logado (admin da Trilha ou incorporadora)
--   service_role   · o servidor do app, usado para criar o login das
--                    incorporadoras. Ignora RLS, mas AINDA precisa de grant.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

grant all on all tables in schema public to service_role;
grant all on all functions in schema public to service_role;

-- Vale também para tabelas e funções criadas daqui para frente.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on functions to service_role;


-- ----------------------------------------------------------------------------
-- PARTE 7 · Transformar você em admin da Trilha
--
-- Isto pega o usuário que você já criou no Authentication → Users e cria a
-- ficha de admin dele. Se você tiver mais de um usuário, ajuste o e-mail.
-- ----------------------------------------------------------------------------

insert into public.conta (id, tipo, nome, email)
select u.id, 'trilha_admin', coalesce(u.raw_user_meta_data ->> 'nome', 'Admin Trilha'), u.email
from auth.users u
on conflict (id) do update set tipo = 'trilha_admin';


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'tabelas' as o_que, string_agg(tablename, ', ' order by tablename) as resultado
from pg_tables where schemaname = 'public'
union all
select 'contas admin', coalesce(string_agg(email, ', '), 'NENHUMA — crie um usuário em Authentication e rode a Parte 7 de novo')
from public.conta where tipo = 'trilha_admin';
