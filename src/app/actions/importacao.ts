"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getSessao } from "@/lib/sessao";
import { escolherMetodo, extrairEstoque, type UnidadeLida } from "@/lib/ia/extrair-estoque";
import { IaOcupadaError } from "@/lib/ia/gemini";
import { calcularPlano, type LinhaImportacao } from "@/lib/importacao/plano";

export type Resultado = { id: string; erro: null } | { id: null; erro: string };

const detalhar = (mensagem: string, erro: { code?: string; message?: string } | null) =>
  erro?.message ? `${mensagem} (${erro.code ?? "sem código"}: ${erro.message})` : mensagem;

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const inteiro = (v: unknown): number | null => {
  const n = numero(v);
  return n === null ? null : Math.round(n);
};

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/**
 * Avisos automáticos por linha. Não impedem nada — servem para dizer onde
 * olhar com atenção nas trinta linhas da tela de conferência.
 */
function calcularAlertas(u: UnidadeLida, todas: UnidadeLida[]): string[] {
  const alertas: string[] = [];
  const valor = numero(u.valor);
  const area = numero(u.metros_quadrados);

  if (!texto(u.identificacao)) alertas.push("sem identificação");
  if (valor === null) alertas.push("sem valor");
  else if (valor < 50_000 || valor > 20_000_000) alertas.push("valor fora da faixa esperada");

  if (area !== null && (area < 10 || area > 2000)) alertas.push("área fora da faixa esperada");

  const id = texto(u.identificacao)?.toLowerCase();
  if (id && todas.filter((o) => texto(o.identificacao)?.toLowerCase() === id).length > 1) {
    alertas.push("identificação repetida no arquivo");
  }

  // Unidades da mesma tipologia costumam ter a mesma área. Divergência grande
  // é um bom indício de leitura errada.
  const tipologia = texto(u.tipologia)?.toLowerCase();
  if (tipologia && area !== null) {
    const areasIrmas = todas
      .filter((o) => texto(o.tipologia)?.toLowerCase() === tipologia)
      .map((o) => numero(o.metros_quadrados))
      .filter((a): a is number => a !== null);

    if (areasIrmas.length > 2) {
      const media = areasIrmas.reduce((s, a) => s + a, 0) / areasIrmas.length;
      if (media > 0 && Math.abs(area - media) / media > 0.25) {
        alertas.push("área destoa das outras da mesma tipologia");
      }
    }
  }

  return alertas;
}

export async function enviarArquivo(formulario: FormData): Promise<Resultado> {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) {
    return { id: null, erro: "Só o admin da Trilha pode importar estoque." };
  }

  const incorporadoraId = String(formulario.get("incorporadora_id") ?? "");
  const contexto = String(formulario.get("contexto") ?? "");
  const arquivo = formulario.get("arquivo");

  if (!incorporadoraId) return { id: null, erro: "Escolha a incorporadora." };
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { id: null, erro: "Anexe o arquivo com a lista de unidades." };
  }
  if (arquivo.size > 20 * 1024 * 1024) {
    return { id: null, erro: "Arquivo muito grande. O limite é 20 MB." };
  }

  const supabase = await createClient();
  const metodo = escolherMetodo(arquivo.name, arquivo.type);

  const { data: importacao, error: erroCriar } = await supabase
    .from("importacao")
    .insert({
      incorporadora_id: incorporadoraId,
      criado_por: sessao?.conta?.id ?? null,
      arquivo_nome: arquivo.name,
      arquivo_tipo: arquivo.type || null,
      metodo_leitura: metodo,
      contexto: contexto.trim() || null,
      status: "processando",
    })
    .select("id")
    .single<{ id: string }>();

  if (erroCriar || !importacao) {
    return { id: null, erro: detalhar("Não foi possível iniciar a importação.", erroCriar) };
  }

  const registrarErro = async (mensagem: string) => {
    await supabase
      .from("importacao")
      .update({ status: "erro", erro: mensagem })
      .eq("id", importacao.id);
  };

  try {
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    const { leitura } = await extrairEstoque({
      arquivo: bytes,
      nome: arquivo.name,
      mime: arquivo.type,
      contexto,
      metodo,
    });

    const unidades = leitura.unidades.filter((u) => numero(u.valor) !== null);

    if (unidades.length === 0) {
      await registrarErro(
        "A IA não encontrou nenhuma unidade com preço neste arquivo. Confira se é a tabela certa.",
      );
      return { id: importacao.id, erro: null };
    }

    const linhas = unidades.map((u, i) => ({
      importacao_id: importacao.id,
      ordem: i,
      identificacao: texto(u.identificacao),
      tipologia: texto(u.tipologia),
      valor: numero(u.valor),
      num_quartos: inteiro(u.num_quartos),
      num_suites: inteiro(u.num_suites),
      num_banheiros: inteiro(u.num_banheiros),
      num_vagas: inteiro(u.num_vagas),
      metros_quadrados: numero(u.metros_quadrados),
      area_total: numero(u.area_total),
      area_garden: numero(u.area_garden),
      posicao_solar: texto(u.posicao_solar),
      numero_matricula: texto(u.numero_matricula),
      matricula_vaga: texto(u.matricula_vaga),
      observacao: texto(u.observacao),
      origem: texto(u.origem),
      alertas: calcularAlertas(u, unidades),
      acao: "criar" as const,
      incluir: true,
    }));

    const { error: erroLinhas } = await supabase.from("importacao_linha").insert(linhas);
    if (erroLinhas) {
      await registrarErro(detalhar("Falha ao gravar as linhas lidas.", erroLinhas));
      return { id: importacao.id, erro: null };
    }

    await supabase
      .from("importacao")
      .update({
        status: "aguardando_revisao",
        empreendimento_detectado: texto(leitura.empreendimento),
        endereco_detectado: texto(leitura.endereco),
      })
      .eq("id", importacao.id);
  } catch (e) {
    // Congestionamento e arquivo ilegível pedem reações opostas: um é "tente
    // de novo em cinco minutos", o outro é "cadastre à mão". Marcamos a
    // diferença aqui para a tela não dar o conselho errado.
    if (e instanceof IaOcupadaError) {
      await registrarErro(`OCUPADA|${e.detalhe}`);
    } else {
      await registrarErro(e instanceof Error ? e.message : "Falha desconhecida na leitura.");
    }
  }

  revalidatePath("/importacao");
  return { id: importacao.id, erro: null };
}

// ------------------------------------------------------------- vincular

/** Liga a importação a um empreendimento existente, ou cria um novo. */
export async function vincularEmpreendimento(
  importacaoId: string,
  escolha: { empreendimentoId?: string; novoNome?: string; novoEndereco?: string },
): Promise<Resultado> {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) return { id: null, erro: "Sem permissão." };

  const supabase = await createClient();

  const { data: importacao } = await supabase
    .from("importacao")
    .select("id, incorporadora_id")
    .eq("id", importacaoId)
    .maybeSingle<{ id: string; incorporadora_id: string }>();

  if (!importacao) return { id: null, erro: "Importação não encontrada." };

  let empreendimentoId = escolha.empreendimentoId;

  if (!empreendimentoId) {
    const nome = escolha.novoNome?.trim();
    if (!nome) return { id: null, erro: "Informe o nome do empreendimento." };

    const { data: novo, error } = await supabase
      .from("empreendimento")
      .insert({
        incorporadora_id: importacao.incorporadora_id,
        nome,
        endereco: escolha.novoEndereco?.trim() || null,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !novo) {
      return { id: null, erro: detalhar("Não foi possível criar o empreendimento.", error) };
    }
    empreendimentoId = novo.id;
  }

  const { error } = await supabase
    .from("importacao")
    .update({ empreendimento_id: empreendimentoId })
    .eq("id", importacaoId);

  if (error) return { id: null, erro: detalhar("Não foi possível vincular.", error) };

  revalidatePath(`/importacao/${importacaoId}`);
  return { id: empreendimentoId, erro: null };
}

// ---------------------------------------------------------------- linha

/** Ajustes manuais na tela de conferência. */
export async function alterarLinha(
  linhaId: string,
  campos: { incluir?: boolean; identificacao?: string; valor?: string },
): Promise<Resultado> {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) return { id: null, erro: "Sem permissão." };

  const alteracoes: Record<string, unknown> = {};
  if (campos.incluir !== undefined) alteracoes.incluir = campos.incluir;
  if (campos.identificacao !== undefined) alteracoes.identificacao = texto(campos.identificacao);
  if (campos.valor !== undefined) alteracoes.valor = numero(campos.valor);

  const supabase = await createClient();
  const { error } = await supabase.from("importacao_linha").update(alteracoes).eq("id", linhaId);

  if (error) return { id: null, erro: detalhar("Não foi possível salvar a alteração.", error) };
  return { id: linhaId, erro: null };
}

// --------------------------------------------------------------- aplicar

export async function aplicarImportacao(importacaoId: string): Promise<Resultado> {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) return { id: null, erro: "Sem permissão." };

  const supabase = await createClient();

  const { data: importacao } = await supabase
    .from("importacao")
    .select("id, empreendimento_id, status")
    .eq("id", importacaoId)
    .maybeSingle<{ id: string; empreendimento_id: string | null; status: string }>();

  if (!importacao) return { id: null, erro: "Importação não encontrada." };
  if (!importacao.empreendimento_id) {
    return { id: null, erro: "Escolha o empreendimento antes de aplicar." };
  }
  if (importacao.status === "aplicada") {
    return { id: null, erro: "Esta importação já foi aplicada." };
  }

  const { data: linhas } = await supabase
    .from("importacao_linha")
    .select("*")
    .eq("importacao_id", importacaoId)
    .order("ordem")
    .returns<LinhaImportacao[]>();

  const plano = await calcularPlano(supabase, importacao.empreendimento_id, linhas ?? []);
  const empreendimentoId = importacao.empreendimento_id;

  const campos = (l: LinhaImportacao) => ({
    identificacao: l.identificacao ?? "sem identificação",
    tipologia: l.tipologia,
    valor: l.valor,
    num_quartos: l.num_quartos,
    num_suites: l.num_suites,
    num_banheiros: l.num_banheiros,
    num_vagas: l.num_vagas,
    metros_quadrados: l.metros_quadrados,
    area_total: l.area_total,
    area_garden: l.area_garden,
    posicao_solar: l.posicao_solar,
    numero_matricula: l.numero_matricula,
    matricula_vaga: l.matricula_vaga,
    observacao: l.observacao,
  });

  const novos = plano.itens
    .filter((i) => i.linha.incluir && i.acao === "criar")
    .map((i) => ({ empreendimento_id: empreendimentoId, status: "disponivel", ...campos(i.linha) }));

  if (novos.length > 0) {
    const { error } = await supabase.from("imovel").insert(novos);
    if (error) return { id: null, erro: detalhar("Falha ao criar as unidades novas.", error) };
  }

  for (const item of plano.itens) {
    if (!item.linha.incluir || item.acao !== "atualizar" || !item.existente) continue;
    const { error } = await supabase
      .from("imovel")
      .update(campos(item.linha))
      .eq("id", item.existente.id);
    if (error) return { id: null, erro: detalhar("Falha ao atualizar uma unidade.", error) };
  }

  // Sumiu da tabela nova e ainda estava disponível: sai do estoque.
  // Só chega aqui quem está "disponivel" — o resto é intocável por regra.
  if (plano.desaparecidas.length > 0) {
    const { error } = await supabase
      .from("imovel")
      .update({ status: "indisponivel" })
      .in(
        "id",
        plano.desaparecidas.map((d) => d.id),
      );
    if (error) return { id: null, erro: detalhar("Falha ao baixar as unidades ausentes.", error) };
  }

  await supabase.from("importacao").update({ status: "aplicada" }).eq("id", importacaoId);

  revalidatePath("/empreendimentos");
  revalidatePath(`/empreendimentos/${empreendimentoId}`);
  revalidatePath("/importacao");
  return { id: empreendimentoId, erro: null };
}

export async function descartarImportacao(importacaoId: string): Promise<Resultado> {
  const sessao = await getSessao();
  if (!ehAdmin(sessao)) return { id: null, erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("importacao")
    .update({ status: "descartada" })
    .eq("id", importacaoId);

  if (error) return { id: null, erro: detalhar("Não foi possível descartar.", error) };

  revalidatePath("/importacao");
  return { id: importacaoId, erro: null };
}
