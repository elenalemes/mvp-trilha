-- ============================================================================
-- REFERÊNCIA — NÃO RODAR
--
-- Este é o schema completo que estava no Supabase em 01/set/2026, antes de
-- recortarmos o banco para a Sprint 1. Ele não está em uso: ficou guardado
-- aqui porque contém modelagem que vale reaproveitar nas próximas sprints —
-- principalmente `negocio`, `parte`, `etapa`, `tarefa`, `contrato`,
-- `solicitacao_ajuste`, `anexo` e `evento_notificacao`.
--
-- O que a Sprint 1 aproveitou daqui: conta, incorporadora, empreendimento e
-- unidade (renomeada para `imovel`). O resto volta quando a sprint chegar lá.
--
-- Observação: o dump abaixo veio do Supabase e marca os enums como
-- USER-DEFINED, sem os valores. Ao reaproveitar, os enums precisam ser
-- recriados junto.
-- ============================================================================

CREATE TABLE public.conta (
  id uuid NOT NULL,
  tipo USER-DEFINED NOT NULL,
  nome text NOT NULL,
  email text,
  telefone text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT conta_pkey PRIMARY KEY (id),
  CONSTRAINT conta_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.incorporadora (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conta_id uuid UNIQUE,
  nome text NOT NULL,
  cnpj text,
  email text,
  endereco text,
  telefone text,
  resp_nome text,
  resp_cpf text,
  resp_estado_civil text,
  resp_cargo text,
  resp_email text,
  resp_telefone text,
  banco text,
  conta_numero text,
  agencia text,
  chave_pix text,
  chave_pix_tipo USER-DEFINED,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT incorporadora_pkey PRIMARY KEY (id),
  CONSTRAINT incorporadora_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.conta(id)
);
CREATE TABLE public.empreendimento (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  incorporadora_id uuid,
  origem USER-DEFINED NOT NULL,
  nome text NOT NULL,
  endereco text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT empreendimento_pkey PRIMARY KEY (id),
  CONSTRAINT empreendimento_incorporadora_id_fkey FOREIGN KEY (incorporadora_id) REFERENCES public.incorporadora(id)
);
CREATE TABLE public.unidade (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empreendimento_id uuid NOT NULL,
  identificacao text,
  numero_matricula text,
  tipo USER-DEFINED,
  status USER-DEFINED NOT NULL DEFAULT 'disponivel'::unidade_status,
  valor numeric,
  metros_quadrados numeric,
  posicao_solar text,
  churrasqueira boolean DEFAULT false,
  sacada boolean DEFAULT false,
  num_quartos integer,
  num_banheiros integer,
  num_vagas integer,
  matricula_vaga text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT unidade_pkey PRIMARY KEY (id),
  CONSTRAINT unidade_empreendimento_id_fkey FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimento(id)
);
CREATE TABLE public.pessoa (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text,
  cpf_cnpj text,
  rg text,
  estado_civil text,
  email text,
  telefone text,
  profissao text,
  data_nascimento date,
  conjuge_id uuid,
  banco text,
  conta_numero text,
  agencia text,
  chave_pix text,
  chave_pix_tipo USER-DEFINED,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pessoa_pkey PRIMARY KEY (id),
  CONSTRAINT pessoa_conjuge_id_fkey FOREIGN KEY (conjuge_id) REFERENCES public.pessoa(id)
);
CREATE TABLE public.negocio (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL,
  status_geral USER-DEFINED NOT NULL DEFAULT 'em_andamento'::negocio_status,
  duracao_meses integer CHECK (duracao_meses = ANY (ARRAY[6, 12, 18, 24])),
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT negocio_pkey PRIMARY KEY (id),
  CONSTRAINT negocio_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id),
  CONSTRAINT negocio_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.conta(id)
);
CREATE TABLE public.parte (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  negocio_id uuid NOT NULL,
  papel USER-DEFINED NOT NULL,
  pessoa_id uuid,
  incorporadora_id uuid,
  responsavel_conta_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT parte_pkey PRIMARY KEY (id),
  CONSTRAINT parte_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES public.negocio(id),
  CONSTRAINT parte_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id),
  CONSTRAINT parte_incorporadora_id_fkey FOREIGN KEY (incorporadora_id) REFERENCES public.incorporadora(id),
  CONSTRAINT parte_responsavel_conta_id_fkey FOREIGN KEY (responsavel_conta_id) REFERENCES public.conta(id)
);
CREATE TABLE public.etapa (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  negocio_id uuid NOT NULL,
  nome text NOT NULL,
  ordem integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT etapa_pkey PRIMARY KEY (id),
  CONSTRAINT etapa_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES public.negocio(id)
);
CREATE TABLE public.tarefa (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  etapa_id uuid NOT NULL,
  negocio_id uuid NOT NULL,
  titulo text NOT NULL,
  tipo USER-DEFINED NOT NULL,
  bloco USER-DEFINED NOT NULL,
  visivel_partes boolean NOT NULL DEFAULT true,
  responsavel_conta_id uuid,
  status text,
  concluida boolean NOT NULL DEFAULT false,
  dados_formulario jsonb,
  ordem integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tarefa_pkey PRIMARY KEY (id),
  CONSTRAINT tarefa_etapa_id_fkey FOREIGN KEY (etapa_id) REFERENCES public.etapa(id),
  CONSTRAINT tarefa_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES public.negocio(id),
  CONSTRAINT tarefa_responsavel_conta_id_fkey FOREIGN KEY (responsavel_conta_id) REFERENCES public.conta(id)
);
CREATE TABLE public.contrato (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  negocio_id uuid NOT NULL,
  tipo USER-DEFINED NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'em_andamento'::contrato_status,
  arquivo_path text,
  link_assinatura text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT contrato_pkey PRIMARY KEY (id),
  CONSTRAINT contrato_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES public.negocio(id)
);
CREATE TABLE public.solicitacao_ajuste (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL,
  solicitante_conta_id uuid,
  descricao text NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'aberta'::ajuste_status,
  resolvido_por uuid,
  resolvido_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT solicitacao_ajuste_pkey PRIMARY KEY (id),
  CONSTRAINT solicitacao_ajuste_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contrato(id),
  CONSTRAINT solicitacao_ajuste_solicitante_conta_id_fkey FOREIGN KEY (solicitante_conta_id) REFERENCES public.conta(id),
  CONSTRAINT solicitacao_ajuste_resolvido_por_fkey FOREIGN KEY (resolvido_por) REFERENCES public.conta(id)
);
CREATE TABLE public.anexo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tarefa_id uuid,
  unidade_id uuid,
  storage_path text NOT NULL,
  nome_arquivo text,
  enviado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT anexo_pkey PRIMARY KEY (id),
  CONSTRAINT anexo_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefa(id),
  CONSTRAINT anexo_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id),
  CONSTRAINT anexo_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES public.conta(id)
);
CREATE TABLE public.evento_notificacao (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  negocio_id uuid,
  tipo_evento text NOT NULL,
  destinatario_conta_id uuid,
  payload jsonb,
  enviado boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT evento_notificacao_pkey PRIMARY KEY (id),
  CONSTRAINT evento_notificacao_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES public.negocio(id),
  CONSTRAINT evento_notificacao_destinatario_conta_id_fkey FOREIGN KEY (destinatario_conta_id) REFERENCES public.conta(id)
);
