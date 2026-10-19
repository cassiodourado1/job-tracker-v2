import { Suspense } from "react";
import { dashboardWindowSchema, type DashboardWindow } from "@recruit/shared";
import {
  getJobsDashboard,
  MarketDashboard,
  MarketLoading,
} from "@/features/market";
import { getSelectedProfile } from "@/features/profile/current-profile";

/**
 * A primeira página é o painel do mercado: abrir o app responde "como está o
 * mercado nos meus filtros" antes de qualquer clique.
 */
export default async function InicioPage({
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

  // Suspense aqui, e não um loading.tsx na raiz: na raiz ele valeria de
  // carregamento para todas as telas do app, não só para esta.
  return (
    <Suspense key={window} fallback={<MarketLoading />}>
      <Dashboard profileId={profile.id} window={window} />
    </Suspense>
  );
}

async function Dashboard({
  profileId,
  window,
}: {
  profileId: string;
  window: DashboardWindow;
}) {
  return <MarketDashboard data={await getJobsDashboard(profileId, window)} />;
}
