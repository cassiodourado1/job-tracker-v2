import { jobDrilldownSchema, type JobDrilldown } from "@recruit/shared";
import { listSavedJobs } from "@/features/jobs";
import { JobDiscovery } from "@/features/jobs/components/job-discovery";
import { getProfileDetail } from "@/features/profile/api";
import { getSelectedProfile } from "@/features/profile/current-profile";

/**
 * A página não busca vaga nenhuma no servidor — os lotes chegam por Server
 * Action, a partir do clique. Buscar aqui faria cada revalidação da rota
 * refazer o fan-out nos portais, e a primeira pintura esperaria segundos por
 * uma lista que o usuário talvez nem queira.
 *
 * O que ela precisa carregar é o que já é do perfil: o filtro salvo e as vagas
 * salvas, para o card nascer mostrando "Salva" em vez de oferecer salvar de
 * novo.
 */
export default async function BuscarVagasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [selected, params] = await Promise.all([
    getSelectedProfile(),
    searchParams,
  ]);

  if (!selected) {
    return null;
  }

  const [profile, saved] = await Promise.all([
    getProfileDetail(selected.id),
    listSavedJobs(selected.id),
  ]);

  return (
    <JobDiscovery
      profileId={selected.id}
      query={params.q ?? ""}
      preferences={profile.preferences}
      savedUrls={saved
        .map((item) => item.job.url)
        .filter((url) => url !== null)}
      savedCount={saved.length}
      drill={drillFrom(params)}
    />
  );
}

/**
 * O recorte que o painel manda pela URL, com os nomes em português que
 * aparecem na barra de endereço. Valor inválido some, em vez de dar erro.
 */
function drillFrom(params: Record<string, string | undefined>): JobDrilldown {
  const parsed = jobDrilldownSchema.safeParse({
    source: params.fonte || undefined,
    company: params.empresa || undefined,
    stack: params.tecnologia || undefined,
    workModel: params.modalidade || undefined,
    postedWithin: params.janela || undefined,
  });

  return parsed.success ? parsed.data : {};
}
