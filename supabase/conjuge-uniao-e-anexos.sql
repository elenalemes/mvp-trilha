-- ----------------------------------------------------------------------------
-- Sprint 4.1c · União estável abre o cônjuge, e cada anexo diz de quem é
-- ----------------------------------------------------------------------------
-- Rode DEPOIS de `ficha-qualificacao-2.sql`.
--
-- DUAS MUDANÇAS (decididas com a Elena em 22/set):
--
--   1. UNIÃO ESTÁVEL também tem cônjuge. A ficha passa a exigir regime de bens
--      e os dados do cônjuge para CASADO e para UNIÃO ESTÁVEL — e a proibi-los
--      para os demais estados civis. Regime vale para os dois: na união
--      estável ele existe por lei (comunhão parcial, se não houver contrato).
--
--   2. CADA ANEXO dos documentos do comprador diz DE QUEM É: do comprador ou
--      do cônjuge. É o que deixa a Trilha ver que falta o RG do cônjuge sem
--      abrir arquivo por arquivo.
--
--      Só existe nas tarefas do corretor (os documentos do comprador). Nos
--      documentos do imóvel e no contrato a coluna fica nula — um trigger
--      garante isso, então a tela não precisa lembrar.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · A trava do cônjuge
--
-- Troca de nome junto com a regra: `ficha_casado` virou mentira.
-- ----------------------------------------------------------------------------

alter table public.ficha_qualificacao drop constraint if exists ficha_casado;
alter table public.ficha_qualificacao drop constraint if exists ficha_conjuge;

alter table public.ficha_qualificacao add constraint ficha_conjuge check (
  case when estado_civil in ('casado', 'uniao_estavel') then
    num_nulls(regime_bens, conjuge_nome, conjuge_email, conjuge_telefone, conjuge_cpf,
              conjuge_rg, conjuge_rg_emissor, conjuge_endereco, conjuge_profissao) = 0
  else
    num_nonnulls(regime_bens, conjuge_nome, conjuge_email, conjuge_telefone, conjuge_cpf,
                 conjuge_rg, conjuge_rg_emissor, conjuge_endereco, conjuge_profissao) = 0
  end
);

comment on table public.ficha_qualificacao is
  'Dados do comprador (e do cônjuge, se casado ou em união estável) para o contrato. Uma por negócio. A incorporadora não lê.';


-- ----------------------------------------------------------------------------
-- PARTE 2 · De quem é o anexo
-- ----------------------------------------------------------------------------

alter table public.checklist_arquivo
  add column if not exists pessoa text check (pessoa in ('comprador', 'conjuge'));

comment on column public.checklist_arquivo.pessoa is
  'Nos documentos do comprador: de quem é o arquivo. Nulo nas demais tarefas.';

-- Os anexos que já existem nos documentos do comprador eram, até aqui, todos
-- tratados como do comprador. Quem souber que algum é do cônjuge troca na tela.
update public.checklist_arquivo a
   set pessoa = 'comprador'
  from public.checklist_item i
 where i.id = a.checklist_item_id
   and i.ator = 'parceiro'
   and a.pessoa is null;

-- A coluna segue a tarefa, não a tela: documento do comprador sem marcação
-- vira "do comprador"; qualquer outra tarefa fica sem marcação.
create or replace function public.arquivo_define_pessoa()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ator public.checklist_ator;
begin
  select ator into v_ator from public.checklist_item where id = new.checklist_item_id;

  if v_ator = 'parceiro' then
    new.pessoa := coalesce(new.pessoa, 'comprador');
  else
    new.pessoa := null;
  end if;

  return new;
end;
$$;

drop trigger if exists checklist_arquivo_define_pessoa on public.checklist_arquivo;
create trigger checklist_arquivo_define_pessoa
  before insert or update of pessoa on public.checklist_arquivo
  for each row execute function public.arquivo_define_pessoa();

-- Trocar a marcação de um arquivo já enviado. Só a coluna `pessoa` — o resto
-- do registro continua imutável —, e só para quem pode mexer nos anexos da
-- tarefa.
--
-- O `revoke` vem antes de propósito: o Supabase dá permissão de UPDATE na
-- tabela inteira por padrão, e aí liberar só uma coluna não restringe nada.
-- Sem ele, quem pode trocar a marcação também poderia trocar o caminho do
-- arquivo — e o caminho é o que a regra do bucket confere.
revoke update on public.checklist_arquivo from authenticated, anon;
grant  update (pessoa) on public.checklist_arquivo to authenticated;

drop policy if exists checklist_arquivo_marcar on public.checklist_arquivo;
create policy checklist_arquivo_marcar on public.checklist_arquivo
  for update to authenticated
  using (public.pode_escrever_arquivo_tarefa(checklist_item_id::text))
  with check (public.pode_escrever_arquivo_tarefa(checklist_item_id::text));


-- ----------------------------------------------------------------------------
-- PARTE 3 · As instruções falam de união estável também
--
-- O `not like` deixa rodar o arquivo duas vezes sem repetir o trecho.
-- ----------------------------------------------------------------------------

update public.checklist_modelo
   set instrucoes = replace(instrucoes, 'casado(a)', 'casado(a) ou viver em união estável')
 where instrucoes like '%casado(a)%' and instrucoes not like '%união estável%';

update public.checklist_item
   set instrucoes = replace(instrucoes, 'casado(a)', 'casado(a) ou viver em união estável')
 where instrucoes like '%casado(a)%' and instrucoes not like '%união estável%';


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'trava do cônjuge' as item,
       coalesce((select conname from pg_constraint
                 where conrelid = 'public.ficha_qualificacao'::regclass
                   and conname = 'ficha_conjuge'), 'NÃO EXISTE') as situacao

union all

select 'coluna pessoa',
       coalesce((select data_type from information_schema.columns
                 where table_schema = 'public' and table_name = 'checklist_arquivo'
                   and column_name = 'pessoa'), 'NÃO EXISTE')

union all

select 'regras dos anexos',
       coalesce(string_agg(policyname, ' | ' order by policyname), 'NENHUMA')
from pg_policies
where schemaname = 'public' and tablename = 'checklist_arquivo'

union all

select 'instrução do documento com foto',
       coalesce((select instrucoes from public.checklist_modelo
                 where titulo = 'Documento com foto'), 'NÃO ACHEI');
