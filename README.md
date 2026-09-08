# Trilha · MVP Incorporadoras

Painel da Trilha para cadastro de incorporadoras parceiras, empreendimentos e imóveis.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres + Auth) · deploy na Vercel.

---

## Sprint 1 — Cadastro base

**Entregue:**

- Login do admin da Trilha
- Cadastro, lista e ficha de incorporadora
- Ao cadastrar, o admin define o acesso (e-mail e senha) que a incorporadora vai usar
- Login da incorporadora, enxergando só o que é dela
- Cadastro de empreendimentos
- Cadastro de imóveis, com "salvar e cadastrar outro" para lançar vários em sequência
- Bloqueio em cascata: sem incorporadora não há empreendimento, sem empreendimento não há imóvel

**Pronto quando:** você cria uma incorporadora, abre uma aba anônima, entra com o login dela e cadastra três imóveis.

---

## Como rodar

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **Authentication → Providers → Email**, desligue *Confirm email*.
3. Em **Authentication → Users → Add user**, crie o seu usuário de admin.
4. Em **SQL Editor**, rode `supabase/sprint-1.sql` inteiro. Ele apaga o schema antigo, cria as quatro tabelas, liga as regras de acesso e transforma o seu usuário em admin da Trilha.
5. Em **Project Settings → API**, copie a Project URL, a chave `anon public` e a chave `service_role`.

### 2. Ambiente local

```bash
cp .env.local.example .env.local   # e preencha as três variáveis
npm install
npm run dev
```

Abra http://localhost:3000.

### 3. Deploy na Vercel

Importe o repositório, adicione as **três** variáveis de ambiente em Environment Variables e faça o deploy.

> A `SUPABASE_SERVICE_ROLE_KEY` não leva o prefixo `NEXT_PUBLIC_` de propósito: ela ignora todas as regras de acesso do banco e só pode existir no servidor.

---

## Rotas

| Rota | Quem acessa | O que faz |
|---|---|---|
| `/login` | todos | Entrada no sistema |
| `/incorporadoras` | admin | Lista das parceiras |
| `/incorporadoras/nova` | admin | Cadastro + criação do acesso |
| `/incorporadoras/[id]` | admin | Ficha completa |
| `/empreendimentos` | admin e incorporadora | Lista |
| `/empreendimentos/novo` | admin e incorporadora | Cadastro |
| `/imoveis` | admin e incorporadora | Lista |
| `/imoveis/novo` | admin e incorporadora | Cadastro em sequência |

Rotas fora de `/login` são protegidas por `src/proxy.ts`.

## Modelo de dados

```
conta ──1:1── incorporadora ──1:N── empreendimento ──1:N── imovel
  │
  └─ espelha o usuário do Supabase Auth e diz o papel (trilha_admin ou incorporadora)
```

**Decisões que valem saber:**

- **As permissões vivem no banco, não só na tela.** As policies (RLS) garantem que uma incorporadora logada só enxerga os empreendimentos e imóveis dela, mesmo que alguém chame a API diretamente. Duas funções (`eh_admin_trilha()` e `minha_incorporadora_id()`) respondem quem é o usuário em cada consulta.
- **CPF e CNPJ são validados por dígito verificador** e gravados só com números. A máscara é coisa de tela.
- **Identificação de imóvel é única por empreendimento** — "Apto 302" duas vezes no mesmo prédio é recusado pelo banco.
- **Criar o acesso da incorporadora é transacional na prática:** se a ficha falhar depois do usuário criado, o usuário é apagado, para não sobrar login órfão.

## Arquivos SQL

| Arquivo | Para que serve |
|---|---|
| `supabase/sprint-1.sql` | O schema em uso |
| `supabase/schema-completo-referencia.sql` | O modelo completo (negócio, contrato, etapa, tarefa, notificação), guardado para as próximas sprints |
| `supabase/schema.sql` | Obsoleto, pode apagar |

## Próximas sprints

- Editar e inativar incorporadora, empreendimento e imóvel
- Tipologia: cadastrar o modelo uma vez e gerar as unidades em lote
- Corretor parceiro e a proposta de negócio
- Aprovação da proposta pela Trilha e abertura do negócio
- Fluxo de fechamento com etapas, tarefas, anexos e contrato
