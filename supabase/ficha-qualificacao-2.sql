-- ----------------------------------------------------------------------------
-- Sprint 4.1b · PARTE 2 de 2 — ficha de qualificação e tarefas de um clique
-- ----------------------------------------------------------------------------
-- Rode DEPOIS de `ficha-qualificacao-1-tipo.sql`.
--
-- TRÊS MUDANÇAS (decididas com a Elena em 22/set):
--
--   1. A FICHA DE QUALIFICAÇÃO deixa de ser documento. São dados que o
--      corretor preenche num formulário: nome, e-mail, telefone, CPF, RG com
--      órgão emissor, endereço, profissão e estado civil. Se CASADO, também o
--      regime de bens e os mesmos dados do cônjuge. Salvar a ficha completa
--      conclui a tarefa.
--
--   2. ANEXAR CONCLUI. O documento está entregue quando tem arquivo — não
--      quando alguém clica em "concluir" depois de anexar. O primeiro arquivo
--      conclui a tarefa, a pessoa pode continuar anexando (RG frente e verso,
--      três holerites), e remover o último arquivo devolve a tarefa para
--      pendente. O status do documento passa a ser CONSEQUÊNCIA dos anexos,
--      como o valor reajustado é consequência do valor.
--
--   3. VALIDADE AUTOMÁTICA. Nos documentos que vencem (matrícula, negativas),
--      anexar preenche a validade com 30 dias a partir do envio. A tela deixa
--      corrigir se a data real for outra.
--
-- E um complemento: as tarefas ganham INSTRUÇÕES, em texto, para o corretor
-- saber o que aceitar sem perguntar (quais comprovantes de renda valem, onde
-- tirar o extrato do Banco Central).
--
-- Os dados da ficha seguem a regra dos documentos do comprador: a Trilha e o
-- corretor do negócio leem e editam. A incorporadora não enxerga.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · Instruções nas tarefas
--
-- Na receita e em cada tarefa, pela mesma razão do resto do checklist: o
-- negócio guarda a versão com que nasceu. Aqui, excepcionalmente, as tarefas
-- que já existem RECEBEM o texto novo — instrução é ajuda, não regra, e
-- ninguém ganha com um negócio aberto mostrando menos orientação.
-- ----------------------------------------------------------------------------

alter table public.checklist_modelo add column if not exists instrucoes text;
alter table public.checklist_item   add column if not exists instrucoes text;

comment on column public.checklist_modelo.instrucoes is
  'Orientação para quem executa a tarefa. Texto simples; quebras de linha e links aparecem na tela.';

update public.checklist_modelo m
   set instrucoes = v.texto
from (values
  ('Documento com foto',
   'RG ou CNH. Se o comprador for casado(a), anexe também o do cônjuge.'),
  ('Comprovante de endereço',
   'Se o comprador for casado(a), anexe também o do cônjuge.'),
  ('Comprovante de estado civil',
   'Se o comprador for casado(a), anexe também o do cônjuge.'),
  ('Extrato do Banco Central',
   E'Relatório de Empréstimos e Financiamentos (SCR). É emitido no Registrato do Banco Central, com o login Gov.br:\nhttps://www.bcb.gov.br/meubc/registrato\n\nSe o comprador for casado(a), anexe também o do cônjuge.'),
  ('Comprovante de renda',
   E'Aceitos conforme a fonte de renda:\n\n• CLT / assalariado: holerites (normalmente os 3 últimos), carteira de trabalho (física ou digital) e extratos bancários compatíveis com a renda.\n• Autônomo / profissional liberal: extratos bancários dos últimos 6 meses e declaração de Imposto de Renda.\n• Empresário / PJ: pró-labore, extratos bancários da PJ e/ou PF e declaração de Imposto de Renda.\n• Aposentado / pensionista: extrato do benefício (INSS ou órgão pagador) e extratos bancários.\n\nSe o comprador for casado(a), anexe também os do cônjuge.'),
  ('Ficha de qualificação',
   'Dados pessoais do comprador — e do cônjuge, se for casado(a). Usados no contrato.')
) as v(titulo, texto)
where m.etapa = 'Documentação do comprador' and m.titulo = v.titulo;

update public.checklist_item i
   set instrucoes = m.instrucoes
  from public.checklist_modelo m
 where i.etapa = m.etapa and i.titulo = m.titulo and m.instrucoes is not null;


-- ----------------------------------------------------------------------------
-- PARTE 2 · A ficha de qualificação
--
-- Uma por negócio, e não na tabela `comprador`: a ficha é o retrato do dia do
-- contrato (endereço, estado civil e profissão mudam), e o mesmo comprador
-- pode fechar dois negócios em anos diferentes. É a mesma lógica da proposta,
-- que congela os números do dia.
--
-- Os dados do cônjuge vivem na mesma linha, com o prefixo `conjuge_`: cônjuge
-- é sempre um só, e o contrato lê os dois juntos. A trava `ficha_casado`
-- garante as duas direções — casado EXIGE regime e cônjuge; qualquer outro
-- estado civil PROÍBE, para não sobrar cônjuge de uma versão anterior da
-- ficha em que alguém marcou "casado" por engano.
--
-- CPF e telefone só com dígitos, como no resto do banco.
-- ----------------------------------------------------------------------------

create table if not exists public.ficha_qualificacao (
  negocio_id          uuid primary key references public.negocio (id) on delete cascade,

  nome                text not null,
  email               text not null,
  telefone            text not null,
  cpf                 text not null,
  rg                  text not null,
  rg_emissor          text not null,
  endereco            text not null,
  profissao           text not null,
  estado_civil        text not null
                        check (estado_civil in ('solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo')),
  regime_bens         text
                        check (regime_bens in ('comunhao_parcial', 'comunhao_universal',
                                               'separacao_total', 'separacao_obrigatoria',
                                               'participacao_final')),

  conjuge_nome        text,
  conjuge_email       text,
  conjuge_telefone    text,
  conjuge_cpf         text,
  conjuge_rg          text,
  conjuge_rg_emissor  text,
  conjuge_endereco    text,
  conjuge_profissao   text,

  preenchida_por      uuid references public.conta (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint ficha_casado check (
    case when estado_civil = 'casado' then
      num_nulls(regime_bens, conjuge_nome, conjuge_email, conjuge_telefone, conjuge_cpf,
                conjuge_rg, conjuge_rg_emissor, conjuge_endereco, conjuge_profissao) = 0
    else
      num_nonnulls(regime_bens, conjuge_nome, conjuge_email, conjuge_telefone, conjuge_cpf,
                   conjuge_rg, conjuge_rg_emissor, conjuge_endereco, conjuge_profissao) = 0
    end
  )
);

comment on table public.ficha_qualificacao is
  'Dados do comprador (e do cônjuge, se casado) para o contrato. Uma por negócio. A incorporadora não lê.';

drop trigger if exists ficha_qualificacao_touch on public.ficha_qualificacao;
create trigger ficha_qualificacao_touch before update on public.ficha_qualificacao
  for each row execute function public.touch_updated_at();


-- --------------------------------------------------------------- quem mexe
-- A Trilha, sempre. O corretor do negócio, enquanto o negócio não foi
-- cancelado. Ninguém mais — nem a incorporadora, pela regra de sempre sobre
-- os dados pessoais do comprador.

create or replace function public.pode_ler_ficha(p_negocio uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_admin_trilha()
      or exists (select 1 from public.negocio n
                 where n.id = p_negocio and n.parceiro_id = public.meu_parceiro_id());
$$;

create or replace function public.pode_editar_ficha(p_negocio uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.negocio n
    where n.id = p_negocio
      and n.status <> 'cancelado'
      and (public.eh_admin_trilha() or n.parceiro_id = public.meu_parceiro_id())
  );
$$;

revoke all on function public.pode_ler_ficha(uuid)    from public;
revoke all on function public.pode_editar_ficha(uuid) from public;
grant execute on function public.pode_ler_ficha(uuid)    to authenticated;
grant execute on function public.pode_editar_ficha(uuid) to authenticated;

alter table public.ficha_qualificacao enable row level security;

grant select, insert, update on public.ficha_qualificacao to authenticated;
grant all                    on public.ficha_qualificacao to service_role;

drop policy if exists ficha_ler on public.ficha_qualificacao;
create policy ficha_ler on public.ficha_qualificacao
  for select to authenticated
  using (public.pode_ler_ficha(negocio_id));

drop policy if exists ficha_criar on public.ficha_qualificacao;
create policy ficha_criar on public.ficha_qualificacao
  for insert to authenticated
  with check (public.pode_editar_ficha(negocio_id) and preenchida_por = auth.uid());

drop policy if exists ficha_editar on public.ficha_qualificacao;
create policy ficha_editar on public.ficha_qualificacao
  for update to authenticated
  using (public.pode_editar_ficha(negocio_id))
  with check (public.pode_editar_ficha(negocio_id) and preenchida_por = auth.uid());


-- ----------------------------------------------------------------------------
-- PARTE 3 · A tarefa da ficha vira formulário
-- ----------------------------------------------------------------------------

update public.checklist_modelo
   set tipo = 'formulario'
 where etapa = 'Documentação do comprador' and titulo = 'Ficha de qualificação';

-- Nos negócios abertos, só onde a tarefa ainda está pendente. Uma ficha que
-- alguém já entregou como documento continua valendo como documento.
update public.checklist_item
   set tipo = 'formulario'
 where etapa = 'Documentação do comprador' and titulo = 'Ficha de qualificação'
   and status = 'pendente';


-- ----------------------------------------------------------------------------
-- PARTE 4 · O status segue a evidência
--
-- Um trigger só, que substitui o `documento_exige_arquivo` da 4.1:
--
--   documento  → concluído só com arquivo; pendente só SEM arquivo.
--                (O segundo lado é novo: com anexo, a tarefa ESTÁ entregue.
--                 Para "desfazer" um documento, remove-se o arquivo.)
--   formulário → concluído só com a ficha salva.
--
-- Os documentos concluídos antes da 4.1, com link colado e sem anexo, não são
-- tocados: a regra vale nas PASSAGENS de status, não no que já está parado.
-- ----------------------------------------------------------------------------

create or replace function public.tarefa_exige_evidencia()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tem_arquivo boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.tipo = 'documento' then
    v_tem_arquivo := exists (select 1 from public.checklist_arquivo a where a.checklist_item_id = new.id);

    if new.status = 'concluido' and not v_tem_arquivo then
      raise exception 'Anexe pelo menos um arquivo antes de concluir "%".', new.titulo
        using errcode = '23514';
    end if;

    if new.status = 'pendente' and v_tem_arquivo then
      raise exception '"%" tem arquivo anexado. Para reabrir, remova os arquivos.', new.titulo
        using errcode = '23514';
    end if;
  end if;

  if new.tipo = 'formulario' and new.status = 'concluido'
     and not exists (select 1 from public.ficha_qualificacao f where f.negocio_id = new.negocio_id)
  then
    raise exception 'Preencha a ficha antes de concluir "%".', new.titulo
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists checklist_item_documento_exige_arquivo on public.checklist_item;
drop trigger if exists checklist_item_exige_evidencia on public.checklist_item;
create trigger checklist_item_exige_evidencia
  before update of status on public.checklist_item
  for each row execute function public.tarefa_exige_evidencia();

drop function if exists public.documento_exige_arquivo();


-- --------------------------------------------- anexar conclui, remover reabre
-- `security definer` porque quem anexa é o corretor ou a incorporadora, e o
-- efeito cai numa linha de `checklist_item` — a policy de update dela
-- continuaria valendo, mas assim o efeito não depende de lembrar disso.

create or replace function public.arquivo_move_documento()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.checklist_item
       set status       = 'concluido',
           concluido_por = new.enviado_por,
           concluido_em  = now(),
           valido_ate    = case when exige_validade then coalesce(valido_ate, current_date + 30)
                                else valido_ate end
     where id = new.checklist_item_id
       and tipo = 'documento'
       and status = 'pendente';
    return new;
  end if;

  -- DELETE: só reabre quando saiu o ÚLTIMO arquivo. A validade vai junto: o
  -- próximo papel é outro papel, com outra data.
  update public.checklist_item
     set status        = 'pendente',
         concluido_por = null,
         concluido_em  = null,
         valido_ate    = null,
         emitido_em    = null
   where id = old.checklist_item_id
     and tipo = 'documento'
     and status = 'concluido'
     and not exists (select 1 from public.checklist_arquivo a
                     where a.checklist_item_id = old.checklist_item_id);
  return old;
end;
$$;

drop trigger if exists checklist_arquivo_move_documento on public.checklist_arquivo;
create trigger checklist_arquivo_move_documento
  after insert or delete on public.checklist_arquivo
  for each row execute function public.arquivo_move_documento();


-- ------------------------------------------------------ salvar a ficha conclui

create or replace function public.ficha_conclui_tarefa()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.checklist_item
     set status        = 'concluido',
         concluido_por = new.preenchida_por,
         concluido_em  = now()
   where negocio_id = new.negocio_id
     and tipo = 'formulario'
     and status = 'pendente';
  return new;
end;
$$;

drop trigger if exists ficha_qualificacao_conclui on public.ficha_qualificacao;
create trigger ficha_qualificacao_conclui
  after insert or update on public.ficha_qualificacao
  for each row execute function public.ficha_conclui_tarefa();


-- ----------------------------------------------------------------------------
-- PARTE 5 · Documento concluído continua aceitando arquivo
--
-- Na 4.1, concluir congelava os anexos. Agora concluir É ter anexo, então
-- congelar impediria justamente o verso do RG. Continua valendo: negócio
-- cancelado não recebe nada, e só o responsável (ou a Trilha) mexe.
-- ----------------------------------------------------------------------------

create or replace function public.pode_escrever_arquivo_tarefa(p_tarefa text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.checklist_item i
    join public.negocio n on n.id = i.negocio_id
    where i.id = public.tarefa_de_texto(p_tarefa)
      -- documento: o papel é a tarefa. veredito: o laudo que sustenta a
      -- decisão (a análise de crédito do Asaas). Confirmação não leva anexo.
      and i.tipo  in ('documento', 'veredito')
      and i.status <> 'nao_se_aplica'
      and n.status <> 'cancelado'
      and (
        public.eh_admin_trilha()
        or (i.ator = 'parceiro'      and n.parceiro_id      = public.meu_parceiro_id())
        or (i.ator = 'incorporadora' and n.incorporadora_id = public.minha_incorporadora_id())
      )
  );
$$;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'instruções na receita' as item,
       count(*)::text || ' tarefas com instrução' as situacao
from public.checklist_modelo where instrucoes is not null

union all

select 'ficha na receita',
       coalesce((select tipo::text from public.checklist_modelo
                 where titulo = 'Ficha de qualificação'), 'NÃO ACHEI')

union all

select 'tabela ficha_qualificacao',
       coalesce(string_agg(column_name, ', ' order by ordinal_position), 'NÃO EXISTE')
from information_schema.columns
where table_schema = 'public' and table_name = 'ficha_qualificacao'

union all

select 'regras da ficha',
       coalesce(string_agg(policyname, ' | ' order by policyname), 'NENHUMA')
from pg_policies
where schemaname = 'public' and tablename = 'ficha_qualificacao'

union all

select 'triggers',
       coalesce(string_agg(tgname, ' | ' order by tgname), 'NENHUM')
from pg_trigger
where tgname in ('checklist_item_exige_evidencia', 'checklist_arquivo_move_documento',
                 'ficha_qualificacao_conclui');
