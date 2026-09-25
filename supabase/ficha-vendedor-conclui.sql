-- ----------------------------------------------------------------------------
-- Sprint 5.5 · Dados do vendedor concluem a tarefa certa
-- ----------------------------------------------------------------------------
-- Rode DEPOIS de `proprietario-pf.sql`.
--
-- Até aqui só existia UMA tarefa de formulário por negócio (Dados do
-- comprador), e as regras do banco foram escritas assim: salvar a ficha do
-- comprador concluía "a" tarefa de formulário, e concluir "uma" tarefa de
-- formulário exigia a ficha do comprador. Com o proprietário PF passam a ser
-- duas — e a do vendedor não pode ser concluída pela ficha do comprador.
--
--   1. Ficha do comprador conclui só a tarefa do comprador (ator 'parceiro').
--   2. Ficha do vendedor conclui só "Dados do vendedor".
--   3. Concluir cada formulário exige a ficha certa.
--   4. Conserto: "Dados do vendedor" concluída sem ficha do vendedor volta a
--      pendente (pode ter acontecido em negócio de teste).
--
-- Rodar inteiro no SQL Editor do Supabase. Não apaga dados.
-- ----------------------------------------------------------------------------


-- 1. Ficha do comprador → tarefa do comprador ---------------------------------

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
     and ator = 'parceiro'
     and status = 'pendente';
  return new;
end;
$$;


-- 2. Ficha do vendedor → "Dados do vendedor" ----------------------------------

create or replace function public.ficha_vendedor_conclui_tarefa()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.checklist_item
     set status        = 'concluido',
         concluido_por = new.preenchida_por,
         concluido_em  = now()
   where negocio_id = new.negocio_id
     and tipo = 'formulario'
     and etapa = 'Documentação do vendedor'
     and status = 'pendente';
  return new;
end;
$$;

drop trigger if exists ficha_vendedor_conclui on public.ficha_vendedor;
create trigger ficha_vendedor_conclui
  after insert or update on public.ficha_vendedor
  for each row execute function public.ficha_vendedor_conclui_tarefa();


-- 3. Cada formulário exige a sua ficha ----------------------------------------

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

  if new.tipo = 'formulario' and new.status = 'concluido' then
    if new.etapa = 'Documentação do vendedor' then
      if not exists (select 1 from public.ficha_vendedor f where f.negocio_id = new.negocio_id) then
        raise exception 'Preencha os dados do vendedor antes de concluir "%".', new.titulo
          using errcode = '23514';
      end if;
    elsif not exists (select 1 from public.ficha_qualificacao f where f.negocio_id = new.negocio_id) then
      raise exception 'Preencha a ficha antes de concluir "%".', new.titulo
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;


-- 4. Conserto ------------------------------------------------------------------

update public.checklist_item i
   set status = 'pendente', concluido_por = null, concluido_em = null
 where i.tipo = 'formulario'
   and i.etapa = 'Documentação do vendedor'
   and i.status = 'concluido'
   and not exists (select 1 from public.ficha_vendedor f where f.negocio_id = i.negocio_id);


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'gatilho da ficha do vendedor' as item,
       coalesce((select 'ok' from pg_trigger where tgname = 'ficha_vendedor_conclui'), 'NÃO EXISTE') as situacao

union all

select 'ficha do comprador só conclui a tarefa do comprador',
       case when pg_get_functiondef('public.ficha_conclui_tarefa()'::regprocedure) like '%ator = ''parceiro''%'
            then 'ok' else 'NÃO' end

union all

select '"Dados do vendedor" concluídas sem ficha',
       (select count(*)::text from public.checklist_item i
         where i.tipo = 'formulario' and i.etapa = 'Documentação do vendedor' and i.status = 'concluido'
           and not exists (select 1 from public.ficha_vendedor f where f.negocio_id = i.negocio_id));
