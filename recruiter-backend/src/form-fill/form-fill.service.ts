import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { resumeSchema, profileLinksSchema } from '@recruit/shared';
import {
  chromium,
  type BrowserContext,
  type Locator,
  type Page,
} from 'playwright-core';
import { assertReachable, FetchError } from '../job/safe-fetch';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { chooseBrowser } from './browser';
import { buildFieldPlan, NEVER_FILL, type PlannedField } from './field-plan';

/**
 * Preenchimento assistido de formulário de candidatura.
 *
 * A funcionalidade 6 do §1, e a regra que a define está no §5, em maiúsculas
 * no espírito: **nunca submeter**. Preenche, para, e espera você revisar.
 *
 * Isso não é excesso de zelo. Candidatura enviada não tem desfazer — você não
 * "descandidata", e uma aplicação ruim queima aquela empresa. E as perguntas
 * que decidem são as abertas, que este código se recusa a responder.
 *
 * Medido antes de escrever: o formulário da Ashby tem reCAPTCHA. Mesmo que
 * alguém quisesse automatizar o envio, não daria — parar antes é a única
 * forma coerente, não um enfeite ético.
 *
 * Navegador VISÍVEL e perfil persistente. Visível porque você precisa ver o
 * que foi preenchido antes de enviar; persistente porque ATS como Gupy exigem
 * conta, e sem sessão guardada cada rodada recomeçaria no login.
 */

/**
 * Onde fica o perfil do Chrome — FORA da pasta do projeto.
 *
 * Ele guarda cookies de sessão logada dos ATS. Estar no `.gitignore` impedia
 * o commit, mas não impedia o resto: zipar o projeto, copiar para outra
 * máquina, mandar para alguém depurar, sincronizar a pasta num drive. Qualquer
 * um desses levaria as sessões junto. No diretório de dados do usuário, o
 * projeto pode ir para onde for sem arrastar credencial.
 */
const PROFILE_DIR = join(
  process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'),
  'job-tracker',
  'browser-profile',
);

const NAV_TIMEOUT_MS = 45_000;
const FIELD_TIMEOUT_MS = 2_500;

export interface FillReport {
  url: string;
  filled: { what: string; value: string }[];
  skipped: string[];
  /** Sempre `false`. Existe para o contrato afirmar o que o código faz. */
  submitted: false;
}

@Injectable()
export class FormFillService {
  private readonly logger = new Logger(FormFillService.name);

  /** Uma rodada por vez: duas ao mesmo tempo disputariam a mesma janela. */
  private running = false;

  /**
   * A janela, reaproveitada entre chamadas.
   *
   * Isto não é cache por desempenho, é necessidade: a janela fica ABERTA de
   * propósito para você revisar, e enquanto está aberta o Chrome mantém o
   * diretório de perfil travado. Um segundo `launchPersistentContext` no mesmo
   * diretório não abre — sai na hora e leva o contexto junto. Foi exatamente o
   * que aconteceu na primeira execução pela API.
   *
   * Cada vaga vira uma ABA na mesma janela, que também é a forma certa de usar.
   */
  private context: BrowserContext | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async fill(profileId: string, rawUrl: string): Promise<FillReport> {
    const url = navigableUrl(rawUrl);

    if (!url) {
      throw new BadRequestException({
        error: 'Bad Request',
        message: 'Link inválido.',
      });
    }

    // O navegador aqui tem SESSÃO LOGADA nos ATS, então navegar para qualquer
    // lugar é mais perigoso que um fetch comum. As URLs vêm de portais de
    // terceiros; uma apontando para 127.0.0.1 ou para a rede interna abriria,
    // com seus cookies, o painel do roteador ou um serviço local.
    //
    // Mesma regra do `safe-fetch`: loopback, rede privada, link-local e
    // metadados de nuvem, conferindo TODO endereço que o host resolve.
    try {
      await assertReachable(new URL(url));
    } catch (error) {
      throw new BadRequestException({
        error: 'Bad Request',
        message:
          error instanceof FetchError
            ? error.message
            : 'Endereço não permitido.',
      });
    }

    if (this.running) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: 'Já existe um preenchimento em andamento.',
      });
    }

    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        name: true,
        email: true,
        phone: true,
        location: true,
        links: true,
        resume: true,
      },
    });

    if (!profile) {
      throw new BadRequestException({
        error: 'Bad Request',
        message: 'Perfil não encontrado.',
      });
    }

    const links = profileLinksSchema.safeParse(profile.links);
    const resume = resumeSchema.safeParse(profile.resume);

    const plan = buildFieldPlan({
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      links: links.success ? links.data : null,
      resume: resume.success ? resume.data : null,
    });

    if (plan.length === 0) {
      throw new BadRequestException({
        error: 'Bad Request',
        message:
          'Nada a preencher: complete nome, email ou telefone no seu perfil.',
      });
    }

    this.running = true;

    try {
      return await this.run(url, plan);
    } finally {
      this.running = false;
    }
  }

  private async run(url: string, plan: PlannedField[]): Promise<FillReport> {
    const context = await this.window();

    // Aba NOVA, sem reaproveitar a inicial: a página que o contexto persistente
    // abre sozinho pode ser substituída no meio da navegação, e o `goto` morre
    // com `ERR_ABORTED; maybe frame was detached`.
    const page = await context.newPage();

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT_MS,
      });

      // Formulário de ATS é SPA: medido, o HTML inicial da Ashby e da Gupy tem
      // ZERO campos. Sem esta espera não haveria o que preencher.
      await page.waitForTimeout(3_000);

      const report = await this.apply(page, plan, url);

      this.logger.log(
        `preenchido ${report.filled.length}/${plan.length} em ${url} — NÃO enviado`,
      );

      // A janela fica ABERTA de propósito: é onde você revisa e envia. Fechar
      // o contexto aqui apagaria o trabalho.
      return report;
    } catch (error) {
      // Fecha só a ABA. Fechar a janela levaria junto o trabalho de outra vaga
      // que você ainda não enviou.
      await page.close().catch(() => undefined);

      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: `Não consegui preencher: ${describe(error)}`,
      });
    }
  }

  /** A janela, abrindo uma se ainda não houver ou se você fechou a anterior. */
  private async window(): Promise<BrowserContext> {
    if (this.context) {
      try {
        // Uma chamada barata que falha se a janela foi fechada na mão.
        this.context.pages();

        return this.context;
      } catch {
        this.context = null;
      }
    }

    const browser = chooseBrowser({
      override: this.config.get('FORM_FILL_BROWSER_PATH', { infer: true }),
    });

    if (!browser) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message:
          'Não achei um navegador para preencher o formulário. Instale o Chrome, Brave, Edge ou Chromium, ou informe o caminho em FORM_FILL_BROWSER_PATH no .env do backend.',
      });
    }

    try {
      const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        // Navegador do sistema, não o Chromium do Playwright: evita 300 MB de
        // download numa máquina que já tem navegador. Chrome pelo canal; os
        // outros (Brave, Edge…) pelo caminho do executável.
        channel: browser.channel,
        executablePath: browser.executablePath,
        headless: false,
        viewport: null,
        // Sem isto o Chrome pode abrir diálogo de primeira execução ou de
        // restauração de sessão, e a navegação aborta com `frame was detached`.
        args: ['--no-first-run', '--no-default-browser-check'],
      });

      context.on('close', () => {
        this.context = null;
      });

      this.context = context;

      return context;
    } catch (error) {
      // O erro do Playwright é longo e técnico; fica no log. A tela recebe o
      // que fazer.
      this.logger.error(`Falha ao abrir ${browser.name}: ${describe(error)}`);

      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: `Não consegui abrir o ${browser.name}. Se ficou uma janela de preenchimento aberta de antes, feche-a e tente de novo.`,
      });
    }
  }

  private async apply(
    page: Page,
    plan: PlannedField[],
    url: string,
  ): Promise<FillReport> {
    const filled: { what: string; value: string }[] = [];
    const skipped: string[] = [];

    for (const item of plan) {
      const target = await locate(page, item);

      if (!target) {
        // Campo não reconhecido fica VAZIO e é reportado. Chutar aqui é pior
        // que não preencher: você pode enviar sem notar o valor errado.
        skipped.push(item.what);
        continue;
      }

      try {
        await target.fill(item.value, { timeout: FIELD_TIMEOUT_MS });
        filled.push({ what: item.what, value: item.value });
      } catch {
        skipped.push(item.what);
      }
    }

    return { url, filled, skipped, submitted: false };
  }
}

/**
 * Acha o campo pelo rótulo, e recusa os que nunca devem ser automatizados.
 *
 * `getByLabel` usa o nome acessível — `<label for>`, `aria-label`,
 * `aria-labelledby`. É o que sobrevive a uma troca de id ou de classe, e foi o
 * único sinal que se mostrou estável num formulário real.
 */
async function locate(page: Page, item: PlannedField): Promise<Locator | null> {
  const byLabel = page.getByLabel(item.labels).first();

  if ((await byLabel.count()) > 0) {
    return (await forbidden(byLabel)) ? null : byLabel;
  }

  if (!item.names) {
    return null;
  }

  // Reforço, nunca sinal principal: medido na Ashby, só os campos de sistema
  // têm nome estável (`_systemfield_email`); toda pergunta personalizada tem
  // nome UUID, diferente a cada vaga.
  for (const candidate of await page.locator('input, textarea').all()) {
    const name = await candidate.getAttribute('name');

    if (name && item.names.test(name) && !(await forbidden(candidate))) {
      return candidate;
    }
  }

  return null;
}

/**
 * Última barreira antes de escrever no campo.
 *
 * O plano já não inclui carta nem pergunta aberta, mas um rótulo pode casar
 * por acidente — "Telefone" dentro de "Qual seu telefone e disponibilidade?".
 * Conferir no elemento encontrado custa uma leitura e evita escrever resposta
 * genérica onde a resposta é o que decide.
 */
async function forbidden(target: Locator): Promise<boolean> {
  const texts = await Promise.all([
    target.getAttribute('aria-label'),
    target.getAttribute('placeholder'),
    target.getAttribute('name'),
  ]);

  return texts.some((text) => text !== null && NEVER_FILL.test(text));
}

function describe(error: unknown): string {
  return error instanceof Error
    ? error.message.split('\n')[0]
    : 'erro desconhecido';
}

/**
 * A URL para NAVEGAR — que não é a URL canônica.
 *
 * Aqui eu usei `canonicalJobUrl` primeiro, e estava errado: ele remove os
 * sufixos `/apply` e `/application` de propósito, porque para efeito de
 * IDENTIDADE o formulário e a página da vaga são a mesma vaga. Só que é
 * exatamente esse sufixo que leva ao formulário — canonizar aqui apagava o
 * destino e a rodada não achava campo nenhum.
 *
 * Identidade e navegação são perguntas diferentes. Esta função só confere se
 * dá para navegar, e devolve o endereço como veio.
 */
function navigableUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());

    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
