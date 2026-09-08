-- ----------------------------------------------------------------------------
-- Aplicar importação numa transação só
-- ----------------------------------------------------------------------------
-- O QUE ESTAVA ERRADO
--
-- A aplicação da importação eram quatro escritas independentes, cada uma com
-- o próprio commit: insere as novas, atualiza as existentes UMA A UMA num
-- laço, baixa as que sumiram, fecha a importação.
--
-- Dois problemas, e a lentidão era o menor deles:
--
--   * 260 unidades = 260 idas à rede em sequência. Na Vercel isso estoura o
--     tempo limite da função e a importação morre no meio.
--   * "no meio" é literal: as unidades já gravadas ficam, as que sumiram não
--     são baixadas, e a importação continua "aguardando conferência". O banco
--     fica num estado que ninguém desenhou.
--
-- Esta função resolve os dois: uma chamada, uma transação. Ou tudo entra, ou
-- nada entra.
--
-- O QUE ELA NÃO FAZ
--
-- Ela NÃO decide o que criar, atualizar ou ignorar. Essa decisão continua em
-- `src/lib/importacao/plano.ts`, porque é ela que alimenta a tela de
-- conferência — reescrevê-la aqui criaria duas fontes de verdade que
-- divergiriam no primeiro ajuste. A função recebe as decisões já tomadas e
-- só executa.
--
-- A regra do "só toca em unidade disponível" está nos dois lados de
-- propósito: o plano já filtra, e o banco confere de novo. Se algum dia uma
-- unidade mudar de status entre a conferência e o clique em aprovar, é o
-- banco que segura.
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ----------------------------------------------------------------------------

drop function if exists public.aplicar_importacao(uuid, uuid, jsonb, jsonb, uuid[]);

create or replace function public.aplicar_importacao(
  p_importacao       uuid,
  p_empreendimento   uuid,
  p_criar            jsonb   default '[]'::jsonb,
  p_atualizar        jsonb   default '[]'::jsonb,
  p_indisponibilizar uuid[]  default '{}'::uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status            text;
  v_criadas           integer := 0;
  v_atualizadas       integer := 0;
  v_indisponibilizadas integer := 0;
begin
  -- --------------------------------------------------------------------
  -- Guardas. A leitura passa pelas policies: importação que esta sessão
  -- não enxerga é indistinguível de importação que não existe, e é assim
  -- que tem que ser.
  -- --------------------------------------------------------------------
  select status::text into v_status
  from public.importacao
  where id = p_importacao;

  if v_status is null then
    raise exception 'Importação não encontrada, ou sem permissão para aplicá-la.'
      using errcode = 'P0002';
  end if;

  if v_status = 'aplicada' then
    raise exception 'Esta importação já foi aplicada.' using errcode = '22023';
  end if;

  -- --------------------------------------------------------------------
  -- 1. As unidades novas
  -- --------------------------------------------------------------------
  insert into public.imovel (
    empreendimento_id, status, identificacao, tipologia, valor,
    num_quartos, num_suites, num_banheiros, num_vagas,
    metros_quadrados, area_total, area_garden,
    posicao_solar, numero_matricula, matricula_vaga, observacao
  )
  select
    p_empreendimento, 'disponivel', n.identificacao, n.tipologia, n.valor,
    n.num_quartos, n.num_suites, n.num_banheiros, n.num_vagas,
    n.metros_quadrados, n.area_total, n.area_garden,
    n.posicao_solar, n.numero_matricula, n.matricula_vaga, n.observacao
  from jsonb_to_recordset(coalesce(p_criar, '[]'::jsonb)) as n(
    identificacao    text,
    tipologia        text,
    valor            numeric,
    num_quartos      integer,
    num_suites       integer,
    num_banheiros    integer,
    num_vagas        integer,
    metros_quadrados numeric,
    area_total       numeric,
    area_garden      numeric,
    posicao_solar    text,
    numero_matricula text,
    matricula_vaga   text,
    observacao       text
  );

  get diagnostics v_criadas = row_count;

  -- --------------------------------------------------------------------
  -- 2. As que já existiam
  --
  -- O `and i.status = 'disponivel'` é a rede de segurança: uma unidade que
  -- entrou em negociação depois da conferência não é tocada, mesmo que o
  -- plano ainda a liste.
  -- --------------------------------------------------------------------
  update public.imovel i
     set identificacao    = a.identificacao,
         tipologia        = a.tipologia,
         valor            = a.valor,
         num_quartos      = a.num_quartos,
         num_suites       = a.num_suites,
         num_banheiros    = a.num_banheiros,
         num_vagas        = a.num_vagas,
         metros_quadrados = a.metros_quadrados,
         area_total       = a.area_total,
         area_garden      = a.area_garden,
         posicao_solar    = a.posicao_solar,
         numero_matricula = a.numero_matricula,
         matricula_vaga   = a.matricula_vaga,
         observacao       = a.observacao
    from jsonb_to_recordset(coalesce(p_atualizar, '[]'::jsonb)) as a(
      id               uuid,
      identificacao    text,
      tipologia        text,
      valor            numeric,
      num_quartos      integer,
      num_suites       integer,
      num_banheiros    integer,
      num_vagas        integer,
      metros_quadrados numeric,
      area_total       numeric,
      area_garden      numeric,
      posicao_solar    text,
      numero_matricula text,
      matricula_vaga   text,
      observacao       text
    )
   where i.id = a.id
     and i.empreendimento_id = p_empreendimento
     and i.status = 'disponivel';

  get diagnostics v_atualizadas = row_count;

  -- --------------------------------------------------------------------
  -- 3. As que sumiram do arquivo saem do estoque
  -- --------------------------------------------------------------------
  update public.imovel
     set status = 'indisponivel'
   where id = any(coalesce(p_indisponibilizar, '{}'::uuid[]))
     and empreendimento_id = p_empreendimento
     and status = 'disponivel';

  get diagnostics v_indisponibilizadas = row_count;

  -- --------------------------------------------------------------------
  -- 4. Fecha a importação
  --
  -- Se este update não pegar nenhuma linha, a sessão leu a importação mas
  -- não pode escrever nela — e aí NADA acima pode valer. A exceção desfaz
  -- a transação inteira. É o oposto do "UPDATE 0" silencioso.
  -- --------------------------------------------------------------------
  update public.importacao
     set status = 'aplicada',
         empreendimento_id = p_empreendimento
   where id = p_importacao;

  if not found then
    raise exception 'Sem permissão para concluir esta importação.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'criadas', v_criadas,
    'atualizadas', v_atualizadas,
    'indisponibilizadas', v_indisponibilizadas
  );
end;
$$;

grant execute on function public.aplicar_importacao(uuid, uuid, jsonb, jsonb, uuid[]) to authenticated;

comment on function public.aplicar_importacao(uuid, uuid, jsonb, jsonb, uuid[]) is
  'Aplica uma importação de estoque numa transação só. Recebe as decisões já tomadas pelo plano em TypeScript; não decide nada. Só toca em unidades disponíveis.';


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'função criada' as item,
       coalesce(string_agg(p.oid::regprocedure::text, ' | '), 'NÃO EXISTE') as situacao
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'aplicar_importacao'

union all

select 'quem pode executar',
       coalesce(string_agg(grantee, ', '), 'NINGUÉM')
from information_schema.routine_privileges
where routine_schema = 'public' and routine_name = 'aplicar_importacao';
