-- ============================================================================
-- AVISOS · PARTE A · a central de avisos
-- ============================================================================
-- Duas tabelas, dois públicos:
--
--   mensagem   tudo o que o sistema manda por WhatsApp para FORA (corretor,
--              comprador, incorporadora). Cada mensagem é gravada ANTES de
--              sair, com uma `chave` que impede a mesma mensagem de nascer
--              duas vezes. Se a uazapi falhar, fica registrada como `falhou`,
--              com o motivo, e é tentada de novo — pela rotina ou pelo botão.
--
--   aviso      o sino do painel da Trilha: proposta nova, mensagem que não
--              saiu, problema na cobrança ou no repasse. Cada admin marca
--              como lido por conta própria (`aviso_lido`).
--
-- Só a chave de servidor ESCREVE nas duas. O admin lê pelo painel.
--
-- Pode rodar mais de uma vez sem estragar nada.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- mensagem
create table if not exists public.mensagem (
  id                    uuid primary key default gen_random_uuid(),
  -- Ex.: 'recusa:<proposta>:comprador:<telefone>'. Mesma chave = mesma
  -- mensagem; a segunda tentativa de criar é ignorada.
  chave                 text not null unique,
  canal                 text not null default 'whatsapp' check (canal in ('whatsapp')),
  destino               text not null,               -- telefone
  destinatario          text,                        -- "Lucas (comprador)"
  papel                 text check (papel in ('comprador', 'corretor', 'vendedor', 'trilha')),
  assunto               text not null,               -- "Proposta recusada"
  texto                 text not null,
  proposta_id           uuid references public.proposta (id) on delete set null,
  negocio_id            uuid references public.negocio (id) on delete set null,
  status                text not null default 'pendente'
                          check (status in ('pendente', 'enviando', 'enviada', 'falhou')),
  tentativas            int not null default 0,
  -- Erro que não adianta repetir (telefone inválido): não volta para a fila.
  definitivo            boolean not null default false,
  erro                  text,
  enviada_em            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists mensagem_fila_idx on public.mensagem (status, created_at)
  where status in ('pendente', 'falhou', 'enviando');
create index if not exists mensagem_proposta_idx on public.mensagem (proposta_id);
create index if not exists mensagem_negocio_idx on public.mensagem (negocio_id);

-- ------------------------------------------------------------------- aviso
create table if not exists public.aviso (
  id          uuid primary key default gen_random_uuid(),
  -- Opcional. Quando vem, o mesmo aviso não aparece duas vezes no sino.
  chave       text unique,
  tipo        text not null,      -- proposta_nova, mensagem_falhou, cobranca, repasse, asaas...
  gravidade   text not null default 'info' check (gravidade in ('info', 'atencao', 'problema')),
  titulo      text not null,
  texto       text,
  link        text,               -- caminho no painel: /propostas/<id>
  created_at  timestamptz not null default now()
);

create index if not exists aviso_recentes_idx on public.aviso (created_at desc);

create table if not exists public.aviso_lido (
  aviso_id  uuid not null references public.aviso (id) on delete cascade,
  conta_id  uuid not null references public.conta (id) on delete cascade,
  lido_em   timestamptz not null default now(),
  primary key (aviso_id, conta_id)
);

-- ------------------------------------------------------------ updated_at
create or replace function public.mensagem_tocar()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mensagem_tocar on public.mensagem;
create trigger mensagem_tocar before update on public.mensagem
  for each row execute function public.mensagem_tocar();

-- ------------------------------------------------------------------- RLS
alter table public.mensagem   enable row level security;
alter table public.aviso      enable row level security;
alter table public.aviso_lido enable row level security;

revoke all on public.mensagem, public.aviso, public.aviso_lido from anon, authenticated;
grant select on public.mensagem, public.aviso, public.aviso_lido to authenticated;
grant all on public.mensagem, public.aviso, public.aviso_lido to service_role;

drop policy if exists mensagem_admin_le on public.mensagem;
create policy mensagem_admin_le on public.mensagem
  for select to authenticated using (public.eh_admin_trilha());

drop policy if exists aviso_admin_le on public.aviso;
create policy aviso_admin_le on public.aviso
  for select to authenticated using (public.eh_admin_trilha());

drop policy if exists aviso_lido_proprio on public.aviso_lido;
create policy aviso_lido_proprio on public.aviso_lido
  for select to authenticated using (public.eh_admin_trilha() and conta_id = auth.uid());

commit;


-- ============================================================================
-- CONFERÊNCIA
-- ============================================================================
select 'tabelas' as item,
       string_agg(table_name, ', ' order by table_name) as situacao
  from information_schema.tables
 where table_schema = 'public' and table_name in ('mensagem', 'aviso', 'aviso_lido')
union all
select 'RLS ligada',
       string_agg(relname || '=' || relrowsecurity::text, ', ' order by relname)
  from pg_class
 where relnamespace = 'public'::regnamespace and relname in ('mensagem', 'aviso', 'aviso_lido');
