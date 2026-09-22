/**
 * O que o sistema manda para fora.
 *
 * Hoje só WhatsApp, pela uazapi. O e-mail fica de fora de propósito: todo
 * caminho sério de envio exige conta em um provedor, e o envio nativo do
 * Supabase é limitado a poucos por hora e cai em spam — o que, para entregar
 * credencial de acesso, é pior do que não mandar. Quando houver provedor,
 * entra aqui, ao lado, com a mesma assinatura.
 *
 * TODA a forma da chamada da uazapi mora no bloco de constantes abaixo. Se o
 * endpoint, o header ou o nome de um campo mudar, o conserto é uma linha e não
 * uma caçada pelo código.
 */

// ------------------------------------------------------------ a chamada
// Confirmado com o workflow que já roda no n8n da Trilha:
//   POST https://trilha.uazapi.com/send/text
//   header: token
//   corpo:  { number, text }
const CAMINHO_TEXTO = "/send/text";
const HEADER_TOKEN = "token";
const CAMPO_NUMERO = "number";
const CAMPO_TEXTO = "text";

export type EnvioResultado = { ok: true } | { ok: false; erro: string };

/**
 * O número no formato que a uazapi espera: só dígitos, com código do país.
 *
 * O cadastro guarda telefone sem máscara e quase sempre sem o 55 — é o que o
 * corretor digita. Mandar `53991592604` para a API entrega no lugar errado ou
 * em lugar nenhum, então o 55 entra aqui, uma vez, e não em cada chamada.
 */
export function numeroWhatsApp(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, "");

  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return digitos;

  // Número estrangeiro ou lixo: não inventa prefixo. Melhor falhar visível do
  // que mandar mensagem para um desconhecido.
  return digitos.length >= 12 ? digitos : null;
}

export async function enviarWhatsApp(telefone: string, texto: string): Promise<EnvioResultado> {
  const url = process.env.UAZAPI_URL;
  const token = process.env.UAZAPI_TOKEN;

  if (!url || !token) {
    return { ok: false, erro: "UAZAPI_URL ou UAZAPI_TOKEN não configurados." };
  }

  const numero = numeroWhatsApp(telefone);
  if (!numero) return { ok: false, erro: `Telefone inválido para WhatsApp: ${telefone}` };

  try {
    const resposta = await fetch(`${url.replace(/\/$/, "")}${CAMINHO_TEXTO}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [HEADER_TOKEN]: token,
      },
      body: JSON.stringify({ [CAMPO_NUMERO]: numero, [CAMPO_TEXTO]: texto }),
      // Sem timeout o envio pendura a resposta da proposta. 10s é generoso
      // para uma API de mensagem e curto para quem está esperando a tela.
      signal: AbortSignal.timeout(10_000),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      return { ok: false, erro: `uazapi respondeu ${resposta.status}: ${corpo.slice(0, 200)}` };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao falar com a uazapi." };
  }
}

// ------------------------------------------------------------ as mensagens
// Texto em um lugar só. Mensagem que o corretor recebe é a primeira impressão
// da Trilha para ele, e não deve estar espalhada dentro de uma action.

/**
 * Proposta aceita: três mensagens, uma por ator, cada uma com o link que é dela.
 *
 * O comprador recebe a página pública de acompanhamento — ele não tem login e
 * nunca vai ter. O corretor e a incorporadora recebem o link do painel, que é
 * onde eles trabalham; mandar a página do comprador para eles seria mandar a
 * versão resumida de um processo em que eles têm tarefas.
 */
export function textoAceitaComprador({
  nome,
  link,
  unidade,
  empreendimento,
}: {
  nome: string;
  link: string;
  unidade: string;
  empreendimento: string;
}): string {
  return [
    `Olá, ${nome.trim().split(/\s+/)[0]}! Sua proposta foi aceita. 🎉`,
    "",
    `🏠 *${unidade}* · ${empreendimento}`,
    "",
    "Agora começa o fechamento. Acompanhe o andamento por aqui, a qualquer hora:",
    link,
    "",
    "Guarde este link — ele é seu e vale até a entrega das chaves.",
  ].join("\n");
}

export function textoAceitaCorretor({
  nome,
  link,
  codigo,
  unidade,
  empreendimento,
}: {
  nome: string;
  link: string;
  codigo: string;
  unidade: string;
  empreendimento: string;
}): string {
  return [
    `Boa notícia, ${nome.trim().split(/\s+/)[0]}! A proposta ${codigo} foi aceita. 🎉`,
    "",
    `🏠 *${unidade}* · ${empreendimento}`,
    "",
    "O fechamento começou e já tem tarefas esperando por você — a documentação do comprador:",
    link,
    "",
    "O comprador também recebeu um link para acompanhar o processo.",
  ].join("\n");
}

export function textoAceitaIncorporadora({
  nome,
  link,
  unidade,
  empreendimento,
}: {
  nome: string;
  link: string;
  unidade: string;
  empreendimento: string;
}): string {
  return [
    `Olá, ${nome.trim().split(/\s+/)[0]}! Uma unidade de vocês foi vendida pela Trilha. 🎉`,
    "",
    `🏠 *${unidade}* · ${empreendimento}`,
    "",
    "O fechamento começou. Há documentos do imóvel esperando por vocês:",
    link,
  ].join("\n");
}

export function textoConviteParceiro({
  nome,
  link,
  proposta,
}: {
  nome: string;
  link: string;
  /** Ausente num reenvio: ali o corretor já sabe de qual proposta se trata. */
  proposta?: { codigo: string; unidade: string; empreendimento: string };
}): string {
  const primeiroNome = nome.trim().split(/\s+/)[0];

  const abertura = proposta
    ? [
        `Olá, ${primeiroNome}! Recebemos a sua proposta na Trilha. 🎉`,
        "",
        `📄 *Proposta:* ${proposta.codigo}`,
        `🏠 *Unidade:* ${proposta.unidade} · ${proposta.empreendimento}`,
      ]
    : [`Olá, ${primeiroNome}! Aqui está o seu acesso à Trilha.`];

  return [
    ...abertura,
    "",
    "Defina a sua senha neste link e acompanhe o andamento por lá:",
    link,
    "",
    "O link vale por 7 dias e só pode ser usado uma vez.",
  ].join("\n");
}
