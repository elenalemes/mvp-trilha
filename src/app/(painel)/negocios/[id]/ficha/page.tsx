import { redirect } from "next/navigation";

/**
 * A ficha tinha página própria até a sprint 4.1d. Agora os dados do comprador
 * abrem dentro do fechamento, na primeira tarefa da etapa. Esta rota fica só
 * para quem guardou o link antigo.
 */
export default async function FichaAntiga({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/negocios/${id}`);
}
