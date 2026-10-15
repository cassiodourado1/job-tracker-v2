import { dashboardWindowSchema } from "@recruit/shared";
import { getJobsDashboard, MarketDashboard } from "@/features/market";
import { getSelectedProfile } from "@/features/profile/current-profile";

export default async function MercadoPage({
  searchParams,
}: {
  searchParams: Promise<{ janela?: string }>;
}) {
  const profile = await getSelectedProfile();

  // Sem perfil o gate mostra o modal por cima; não há o que renderizar aqui.
  if (!profile) {
    return null;
  }

  // Janela desconhecida na URL cai na de 7 dias em vez de dar erro.
  const { janela } = await searchParams;
  const window = dashboardWindowSchema.catch("7d").parse(janela);
  const data = await getJobsDashboard(profile.id, window);

  return <MarketDashboard data={data} />;
}
