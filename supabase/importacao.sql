-- ============================================================================
-- IMPORTACAO DE ESTOQUE
--
-- Cria: colunas novas em `imovel`, e duas tabelas de rascunho onde a leitura
-- do arquivo fica ate voce aprovar. NADA entra em `imovel` antes da aprovacao.
--
-- Rode este arquivo inteiro. Ele e aditivo -- nao apaga nem altera dado
-- existente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PARTE 1 · Campos novos do imovel
--
-- Vieram da analise das tabelas reais das incorporadoras:
--   tipologia    -- "Studio", "1D", "2D". Studio e 1D tem os dois 1 quarto,
--                   mas nao sao a mesma coisa na venda: precisam se distinguir.
--   area_total   -- as tabelas trazem privativa E total
--   area_garden  -- algumas unidades tem
--   observacao   -- "nao aceita dacao", "decorado" -- muda a negociacao
-- ----------------------------------------------------------------------------

alter table public.imovel
  add column if not exists tipologia   text,
  add column if not exists area_total  numeric(8, 2),
  add column if not exists area_garden numeric(8, 2),
  add column if not exists observacao  text;


-- ----------------------------------------------------------------------------
-- PARTE 2 · Estados de uma importacao
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'importacao_status') then
    create type public.importacao_status as enum (
      'processando',        -- arquivo enviado, IA lendo
      'aguardando_revisao', -- leitura pronta, esperando aprovacao
      'aplicada',           -- aprovada e gravada em imovel
      'descartada',         -- usuario desistiu
      'erro'                -- falha na leitura
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'linha_acao') then
    create type public.linha_acao as enum (
      'criar',      -- unidade nova
      'atualizar',  -- ja existe e vai ser atualizada
      'ignorar'     -- ja existe mas nao esta disponivel: intocavel
    );
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- PARTE 3 · A importacao (um arquivo enviado)
-- ----------------------------------------------------------------------------

create table if not exists public.importacao (
  id                        uuid primary key default gen_random_uuid(),
  incorporadora_id          uuid not null references public.incorporadora (id) on delete cascade,

  -- Fica nulo ate o usuario vincular a um empreendimento existente ou criar um.
  empreendimento_id         uuid references public.empreendimento (id) on delete set null,

  criado_por                uuid references public.conta (id) on delete set null,

  arquivo_nome              text,
  arquivo_tipo              text,
  -- 'planilha' | 'texto' | 'documento' -- como o arquivo foi lido.
  -- A tela mostra isso: leitura de planilha e confiavel, de imagem pede
  -- conferencia mais atenta.
  metodo_leitura            text,

  -- Texto livre que o usuario escreveu junto com o arquivo.
  contexto                  text,

  -- O que a IA achou que era o empreendimento, antes de voce confirmar.
  empreendimento_detectado  text,
  endereco_detectado        text,

  status                    public.importacao_status not null default 'processando',
  erro                      text,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists importacao_incorporadora_idx on public.importacao (incorporadora_id);
create index if not exists importacao_status_idx        on public.importacao (status);


-- ----------------------------------------------------------------------------
-- PARTE 4 · Cada unidade lida do arquivo
--
-- Só `valor` e obrigatorio na pratica: linha sem valor nao entra. Os demais
-- campos ficam nulos quando a IA nao conseguiu ler com seguranca -- melhor
-- vazio do que deduzido.
-- ----------------------------------------------------------------------------

create table if not exists public.importacao_linha (
  id                uuid primary key default gen_random_uuid(),
  importacao_id     uuid not null references public.importacao (id) on delete cascade,
  ordem             integer not null default 0,

  identificacao     text,
  tipologia         text,
  valor             numeric(14, 2),
  num_quartos       integer,
  num_suites        integer,
  num_banheiros     integer,
  num_vagas         integer,
  metros_quadrados  numeric(8, 2),
  area_total        numeric(8, 2),
  area_garden       numeric(8, 2),
  posicao_solar     text,
  numero_matricula  text,
  matricula_vaga    text,
  observacao        text,

  -- A linha como aparecia no arquivo. E o que permite conferir em vez de
  -- confiar: voce compara lado a lado com o que foi interpretado.
  origem            text,

  -- O que vai acontecer se voce aprovar.
  acao              public.linha_acao not null default 'criar',

  -- Preenchido quando a unidade ja existe no empreendimento.
  imovel_id         uuid references public.imovel (id) on delete set null,

  -- Avisos automaticos: valor fora de faixa, area divergente da tipologia,
  -- identificacao repetida no proprio arquivo.
  alertas           text[] not null default '{}',

  -- Desmarcar exclui a linha da aprovacao sem apagar o registro.
  incluir           boolean not null default true,

  created_at        timestamptz not null default now()
);

create index if not exists importacao_linha_importacao_idx on public.importacao_linha (importacao_id);


-- ----------------------------------------------------------------------------
-- PARTE 5 · updated_at automatico
-- ----------------------------------------------------------------------------

drop trigger if exists importacao_touch on public.importacao;
create trigger importacao_touch before update on public.importacao
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- PARTE 6 · Acesso
--
-- Importacao e ferramenta interna: so o admin da Trilha enxerga e mexe.
-- A incorporadora continua cadastrando manualmente pelo painel dela.
-- ----------------------------------------------------------------------------

alter table public.importacao       enable row level security;
alter table public.importacao_linha enable row level security;

drop policy if exists importacao_admin on public.importacao;
create policy importacao_admin on public.importacao
  for all to authenticated
  using (public.eh_admin_trilha()) with check (public.eh_admin_trilha());

drop policy if exists importacao_linha_admin on public.importacao_linha;
create policy importacao_linha_admin on public.importacao_linha
  for all to authenticated
  using (public.eh_admin_trilha()) with check (public.eh_admin_trilha());

-- Os papeis precisam de permissao nas tabelas novas (as default privileges
-- da correcao anterior ja cobrem, mas garantimos aqui de novo).
grant select, insert, update, delete on public.importacao, public.importacao_linha to authenticated;
grant all on public.importacao, public.importacao_linha to service_role;


-- ----------------------------------------------------------------------------
-- Conferencia
-- ----------------------------------------------------------------------------

select 'colunas novas em imovel' as o_que,
       string_agg(column_name, ', ' order by column_name) as resultado
from information_schema.columns
where table_schema = 'public' and table_name = 'imovel'
  and column_name in ('tipologia', 'area_total', 'area_garden', 'observacao')
union all
select 'tabelas de importacao',
       string_agg(tablename, ', ' order by tablename)
from pg_tables
where schemaname = 'public' and tablename in ('importacao', 'importacao_linha');
