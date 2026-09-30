-- ----------------------------------------------------------------------------
-- Sprint 6.2 · Tarefa que não se aplica (item A7 do backlog)
-- ----------------------------------------------------------------------------
-- Casa não tem negativa de condomínio. Hoje a tarefa fica pendente para
-- sempre e trava o nível inteiro, porque um nível só abre quando todas as
-- tarefas dos anteriores fecham. Agora ela pode ser DISPENSADA.
--
-- DECIDIDO COM O MATHEUS (30/set):
--
--   * Só a TRILHA dispensa. Quem decide que um documento pode faltar é quem
--     responde pelo fechamento. A regra vive num GATILHO, não na tela: as
--     policies de update da incorporadora e do corretor já deixam os dois
--     mexerem nas tarefas deles com qualquer status, então sem o gatilho
--     qualquer um dispensaria a própria pendência chamando a API direto.
--
--   * O MOTIVO é obrigatório e anda junto do status, nas duas direções. Uma
--     tarefa dispensada sem explicação é uma tarefa que ninguém sabe por que
--     sumiu, seis meses depois. A trava é um `check`, então não existe caminho
--     que grave um sem o outro — nem pela tela, nem pela API.
--
--   * Só dispensa o que está PENDENTE. Dispensar algo já concluído seria
--     apagar um fato. E, como o primeiro anexo é o que conclui um documento,
--     exigir `pendente` garante de quebra que nenhuma tarefa com arquivo
--     anexado é dispensada.
--
--   * A dispensada SAI DA CONTA do andamento — não conta como feita. Um
--     negócio com 20 tarefas e uma dispensada passa a ter 19, e o percentual
--     vira "quanto do que de fato se aplica já foi feito". Isso é do lado do
--     app (`progresso()` em `lib/fechamento.ts`); aqui fica só o dado.
--
-- O valor `nao_se_aplica` já existe no enum desde a 3.4, então este arquivo
-- não mexe em tipo nenhum e roda inteiro de uma vez — sem a divisão em duas
-- partes que a ficha de qualificação precisou.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · O motivo, amarrado ao status
-- ----------------------------------------------------------------------------

alter table public.checklist_item
  add column if not exists dispensa_motivo text;

comment on column public.checklist_item.dispensa_motivo is
  'Por que a tarefa não se aplica a este negócio. Existe exatamente quando status = nao_se_aplica.';

-- Rede de segurança: se algum negócio de teste já tiver tarefa dispensada de
-- antes desta coluna existir, ela ganha um motivo em vez de derrubar o `check`
-- abaixo e o arquivo inteiro junto.
update public.checklist_item
   set dispensa_motivo = 'Dispensada antes de este campo existir.'
 where status = 'nao_se_aplica'
   and (dispensa_motivo is null or btrim(dispensa_motivo) = '');

-- Nas DUAS direções: dispensada sem motivo não grava, e motivo sobrando numa
-- tarefa que voltou a pendente também não.
alter table public.checklist_item drop constraint if exists checklist_dispensa_motivo;
alter table public.checklist_item add constraint checklist_dispensa_motivo check (
  (status = 'nao_se_aplica') = (dispensa_motivo is not null and btrim(dispensa_motivo) <> '')
);


-- ----------------------------------------------------------------------------
-- PARTE 2 · Só a Trilha dispensa, e só o que está pendente
--
-- Gatilho e não policy: recortar o status dentro das policies exigiria
-- reescrever as duas que existem e repetir a condição em `using` e em
-- `with check` — quatro lugares para a mesma frase, e um lugar esquecido no
-- dia em que aparecer uma terceira. O gatilho diz uma vez.
-- ----------------------------------------------------------------------------

create or replace function public.dispensa_e_da_trilha()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'nao_se_aplica' and old.status is distinct from new.status then

    if not public.eh_admin_trilha() then
      -- 23514 e não 42501 de propósito: o app repassa para a tela a frase de
      -- um 23514, e esta frase explica melhor do que "não consegui salvar".
      raise exception 'Só a Trilha pode marcar uma tarefa como "não se aplica".'
        using errcode = '23514';
    end if;

    if old.status <> 'pendente' then
      raise exception 'Só uma tarefa pendente pode ser dispensada. Desfaça "%" antes.', new.titulo
        using errcode = '23514';
    end if;

  end if;

  return new;
end;
$$;

drop trigger if exists checklist_item_dispensa on public.checklist_item;
create trigger checklist_item_dispensa
  before update on public.checklist_item
  for each row execute function public.dispensa_e_da_trilha();


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'coluna dispensa_motivo' as item,
       coalesce(string_agg(data_type, ', '), 'NÃO EXISTE') as situacao
from information_schema.columns
where table_schema = 'public'
  and table_name = 'checklist_item'
  and column_name = 'dispensa_motivo'

union all

select 'trava do motivo',
       coalesce(string_agg(conname, ', '), 'NENHUMA')
from pg_constraint
where conrelid = 'public.checklist_item'::regclass
  and conname = 'checklist_dispensa_motivo'

union all

select 'gatilho da dispensa',
       coalesce(string_agg(tgname, ', '), 'NENHUM')
from pg_trigger
where tgrelid = 'public.checklist_item'::regclass
  and tgname = 'checklist_item_dispensa'

union all

select 'tarefas já dispensadas',
       count(*)::text
from public.checklist_item
where status = 'nao_se_aplica';
