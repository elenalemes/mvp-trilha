-- ----------------------------------------------------------------------------
-- Sprint 4.1e · Documentos do cônjuge: o que é obrigatório e o que não é
-- ----------------------------------------------------------------------------
-- Rode DEPOIS de `dados-comprador-primeiro.sql`.
--
-- DECIDIDO COM A ELENA (22/set): comprovante de endereço e comprovante de
-- estado civil do CÔNJUGE não são obrigatórios. Documento com foto,
-- comprovante de renda e extrato do Banco Central continuam pedindo os do
-- cônjuge, quando há cônjuge.
--
-- Vira dado da tarefa (`pede_conjuge`), não uma lista de títulos na tela: é
-- o que decide se o grupo "Cônjuge" diz "falta anexar" ou "opcional".
--
-- E UMA CORREÇÃO: desde a 4.1b as tarefas têm `instrucoes`, mas a função que
-- cria o checklist ao aceitar a proposta não copiava essa coluna — negócios
-- novos nasceriam sem instrução. Ela é refeita aqui copiando `instrucoes` e
-- `pede_conjuge`. Negócios criados nesse intervalo recebem as instruções da
-- receita agora.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · Quais documentos pedem o do cônjuge
-- ----------------------------------------------------------------------------

alter table public.checklist_modelo add column if not exists pede_conjuge boolean not null default false;
alter table public.checklist_item   add column if not exists pede_conjuge boolean not null default false;

comment on column public.checklist_modelo.pede_conjuge is
  'Documento do comprador que também exige o do cônjuge, quando há cônjuge na ficha.';

update public.checklist_modelo
   set pede_conjuge = (titulo in ('Documento com foto', 'Comprovante de renda', 'Extrato do Banco Central'))
 where etapa = 'Documentação do comprador';

update public.checklist_item i
   set pede_conjuge = m.pede_conjuge
  from public.checklist_modelo m
 where i.etapa = m.etapa and i.titulo = m.titulo;


-- ----------------------------------------------------------------------------
-- PARTE 2 · As instruções param de pedir o que não é obrigatório
--
-- Nos dois comprovantes a instrução era só "anexe também o do cônjuge". Sem
-- essa frase, não sobra nada — então a instrução sai.
-- ----------------------------------------------------------------------------

update public.checklist_modelo
   set instrucoes = null
 where etapa = 'Documentação do comprador'
   and titulo in ('Comprovante de endereço', 'Comprovante de estado civil');

update public.checklist_item
   set instrucoes = null
 where etapa = 'Documentação do comprador'
   and titulo in ('Comprovante de endereço', 'Comprovante de estado civil');

-- Negócios criados depois da 4.1b sem instrução (o defeito da função).
update public.checklist_item i
   set instrucoes = m.instrucoes
  from public.checklist_modelo m
 where i.etapa = m.etapa and i.titulo = m.titulo
   and i.instrucoes is null and m.instrucoes is not null;


-- ----------------------------------------------------------------------------
-- PARTE 3 · Aceitar a proposta copia as colunas novas
--
-- Mesma função da `negocio.sql`, só com `instrucoes` e `pede_conjuge` na
-- cópia do checklist. Assinatura e retorno iguais, então `create or replace`
-- basta.
-- ----------------------------------------------------------------------------

create or replace function public.aceitar_proposta(
  p_proposta uuid,
  p_motivo   text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_imovel   uuid;
  v_status   public.proposta_status;
  v_negocio  uuid;
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

  -- O negócio, com os vínculos copiados da proposta.
  insert into public.negocio
    (proposta_id, imovel_id, empreendimento_id, incorporadora_id, parceiro_id, comprador_id)
  select p.id, p.imovel_id, p.empreendimento_id, p.incorporadora_id, p.parceiro_id, p.comprador_id
  from public.proposta p
  where p.id = p_proposta
  returning id into v_negocio;

  -- E o checklist dele, a partir da receita.
  insert into public.checklist_item
    (negocio_id, etapa, etapa_ordem, ordem, titulo, ator, tipo, exige_validade, interna,
     instrucoes, pede_conjuge)
  select v_negocio, m.etapa, m.etapa_ordem, m.ordem, m.titulo, m.ator, m.tipo,
         m.exige_validade, m.interna, m.instrucoes, m.pede_conjuge
  from public.checklist_modelo m
  where m.ativo;

  return v_negocio;
end;
$$;

revoke all on function public.aceitar_proposta(uuid, text) from public;
grant execute on function public.aceitar_proposta(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select titulo, pede_conjuge, instrucoes is not null as tem_instrucao
from public.checklist_modelo
where etapa = 'Documentação do comprador'
order by ordem;
