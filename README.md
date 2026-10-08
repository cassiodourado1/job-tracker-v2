# job-tracker

Rastreador pessoal de candidaturas a vagas de emprego. Encontra vagas, lê os
emails dos processos seletivos, ajuda a preencher formulários e mostra o que
acontece depois que você se candidata.

> **Roda só na sua máquina.** É um app para uma pessoa, sem login e sem
> deploy: você clona, sobe e usa em `127.0.0.1`. A API não tem autenticação
> de propósito, e isso só é seguro porque nada fica exposto na rede. Não
> publique num servidor. Mais em [Segurança](#segurança).

## Por que existe

O difícil de procurar emprego não é a ferramenta, é o atrito de registrar
cada candidatura. Se cadastrar uma vaga leva mais de trinta segundos, a
planilha é abandonada na terceira semana, e com ela a única forma de saber o
que está funcionando.

A ideia aqui é registrar sem digitar. A vaga vem da descoberta, a confirmação
de candidatura vem do email, e quando a empresa responde o Claude lê o email e
sugere o novo status. Você confirma com um clique.

## O que ele faz

| Funcionalidade | Precisa de chave da Anthropic? |
| --- | --- |
| Candidaturas: cadastro, status, histórico, busca, filtros e ordenação | não |
| Descoberta de vagas em Gupy, Remotar, Nerdin, Programathor, Greenhouse, Lever, Ashby, agregadores remotos, portais brasileiros e alertas do LinkedIn | não |
| Empresas acompanhadas: todas as vagas de empresas que você escolhe, na Gupy, InHire, Greenhouse, Lever ou Ashby | não |
| Lista de vagas com contador, anúncios repetidos da mesma vaga num card só e ordenação (mais recentes, relevância, empresa, cargo) | não |
| Currículo estruturado, import do LinkedIn, PDF pela impressão do navegador e versão congelada em cada candidatura | não |
| Preenchimento de formulário de candidatura no Chrome, parando antes do envio | não |
| Painel com funil, tempo até a primeira resposta e aproveitamento por fonte | não |
| Leitura dos emails do processo seletivo e vínculo com a candidatura certa | não |
| Sugestão de status a partir do email (recusa, entrevista, teste, proposta) | sim |
| "Resolver por IA": vincular ou criar candidaturas a partir de vários emails | sim |
| Extração de vaga a partir de um link | sim |
| Respostas para perguntas abertas de formulário, a partir do seu currículo | sim |
| Importar currículo a partir de um PDF | sim |

Sem a chave, tudo da primeira metade funciona. Com ela, o Claude entra só onde
você pede, e o que ele propõe passa pelo seu clique antes de virar dado.

## Requisitos

- **Node.js 20.9 ou mais novo** e npm
- **Docker**, para o Postgres
- **Um navegador baseado em Chromium** (Chrome, Brave, Edge, Chromium ou
  Vivaldi), só se for usar o preenchimento de formulário
- Opcional: uma **chave da API da Anthropic** com crédito, e uma **conta do
  Gmail** para a leitura de emails

## Começando

```bash
git clone <url-deste-repositório> job-tracker
cd job-tracker
npm install
```

O `npm install` também gera o cliente do Prisma e compila o pacote
compartilhado.

Copie os arquivos de configuração. Os valores padrão já funcionam para rodar
localmente:

```bash
cp .env.example .env
cp recruiter-backend/.env.example recruiter-backend/.env
cp recruiter-frontend/.env.example recruiter-frontend/.env.local
```

Suba o banco e crie as tabelas:

```bash
npm run infra:up     # Postgres no Docker, escutando só em 127.0.0.1:5432
npm run db:deploy    # aplica as migrations
npm run db:seed      # cria o primeiro perfil (opcional: dá para criar pela tela)
```

Rode a API e as telas, cada uma num terminal:

```bash
npm run dev:worker   # API em http://127.0.0.1:3333
npm run dev:web      # telas em http://127.0.0.1:3000
```

Abra **http://127.0.0.1:3000**.

### Primeiros passos no app

1. **Escolha ou crie um perfil.** Perfil é só um seletor: dá para separar, por
   exemplo, "Backend" e "Tech Lead", cada um com seu currículo e suas
   candidaturas.
2. **Preencha o currículo** em *Currículo*. Dá para importar de um **PDF**
   (precisa da chave da Anthropic; veja abaixo o que é enviado) ou do arquivo
   de dados que o LinkedIn exporta (*Configurações → Privacidade de dados →
   Obter uma cópia dos seus dados*). Nos dois casos o formulário é preenchido
   para você revisar, e nada é gravado até você salvar.
3. **Procure vagas** em *Vagas*. Em *Filtros* ficam os **termos de busca**
   (o que os portais procuram — sem "front-end" ali, vaga de front-end nem
   chega), o título, a modalidade, o contrato e as **empresas acompanhadas**.
   Salve as vagas que interessam e descarte o resto. A caixa *Filtrar por
   cargo ou tecnologia* restringe a busca ao texto digitado, e a tela avisa
   enquanto ela estiver em uso.
4. **Registre candidaturas** em *Candidaturas*, ou deixe que venham dos
   emails (veja abaixo).

## Configuração opcional

Tudo abaixo fica em `recruiter-backend/.env`. Depois de mudar o arquivo,
reinicie a API.

### Claude (Anthropic)

```env
ANTHROPIC_API_KEY=sua-chave
```

A chave precisa de crédito: sem saldo, a API responde erro e a tela avisa.

Os modelos usados são o **Haiku** para ler vagas, emails e currículos e o
**Sonnet** para escrever respostas de formulário. O app só chama o Claude quando você pede
(um clique, uma seleção) ou ao sincronizar emails já vinculados a uma
candidatura. No uso pessoal, cada chamada custa frações de centavo de dólar.

O que sai da sua máquina:

- **Emails:** só os vinculados a uma candidatura e com remetente confirmado.
  A caixa de entrada nunca é enviada.
- **Currículo:** só a parte profissional, sem nome, contatos ou data de
  nascimento. Na importação de PDF, o texto é extraído na sua máquina e
  perde nome, email, telefone, links, CPF e linhas de dados pessoais antes de
  ir ao Claude; email, telefone e links preenchem o perfil direto. A cidade
  fica, para a busca achar vagas locais.
- **Vagas:** o texto da vaga que você está usando.

Texto escrito pelo Claude carrega a marca d'água estatística que a Anthropic
aplica desde agosto de 2026. Por isso as respostas de formulário vêm, por
padrão, como tópicos para você escrever.

### Email (Gmail)

A leitura usa um **rótulo** do Gmail, nunca a caixa de entrada inteira: o
próprio Gmail garante esse limite antes de o app ver qualquer email.

1. Ative a verificação em duas etapas na conta Google.
2. Gere uma **senha de app** em `myaccount.google.com/apppasswords`. Nunca use
   a senha principal da conta.
3. Crie o rótulo `job-tracker` e, em *Configurações → Marcadores*, marque
   **Mostrar no IMAP**. Sem isso o rótulo existe na web e fica invisível para
   o app.
4. Crie um filtro que aplique esse rótulo aos emails das plataformas de
   recrutamento. Use o domínio de onde o email **sai**, que nem sempre é o do
   site: a Gupy envia de `gupy.com.br`, o Greenhouse de `greenhouse-mail.io`,
   a InHire de `inhire.app`. Inclua `jobalerts-noreply@linkedin.com` para os
   alertas de vaga do LinkedIn entrarem na descoberta. Na dúvida, abra um
   email da plataforma e veja o remetente. Ao salvar, marque *Aplicar filtro
   também às conversas correspondentes*.
5. Preencha no `.env`:

   ```env
   IMAP_HOST=imap.gmail.com
   IMAP_USER=seu-email@gmail.com
   IMAP_PASSWORD=a-senha-de-app
   ```

A sincronização roda uma vez quando a API sobe e, depois disso, só quando você
clica em **Sincronizar agora** na tela *Emails*. Para trazer emails mais
antigos que o último sincronizado (depois de ampliar o filtro, por exemplo):

```bash
curl -X POST -H 'Content-Type: application/json' \
  'http://127.0.0.1:3333/emails/sync?days=45'
```

### Empresas acompanhadas na descoberta

A busca por portais só acha o que casa com os seus termos. Para trazer
**todas** as vagas de uma empresa, cole o endereço da página de vagas dela em
*Vagas → Filtros → Empresas acompanhadas*. A plataforma é reconhecida pelo
endereço, e a tela mostra na hora se reconheceu:

| Plataforma | Exemplo de endereço |
| --- | --- |
| Gupy | `empresa.gupy.io` |
| InHire | `empresa.inhire.app` |
| Greenhouse | `boards.greenhouse.io/empresa` |
| Lever | `jobs.lever.co/empresa` |
| Ashby | `jobs.ashbyhq.com/empresa` |

Muitas empresas não têm sistema de vagas próprio: a página "Vagas" do site
mostra vagas hospedadas numa dessas plataformas. Abra uma vaga no site da
empresa e veja para onde o link aponta. O site da CI&T, por exemplo, já é
reconhecido e lido pela Lever dela. Empresas em Workday, SuccessFactors ou
Oracle não são lidas.

Também dá para fixar boards no `.env`, valendo para todos os perfis. Liste os
slugs, separados por vírgula:

```env
DISCOVERY_GREENHOUSE_BOARDS=empresa-um,empresa-dois
DISCOVERY_ASHBY_BOARDS=
DISCOVERY_LEVER_BOARDS=
```

O slug é a parte do endereço do board: `boards.greenhouse.io/<slug>`,
`jobs.ashbyhq.com/<slug>`, `jobs.lever.co/<slug>`. Slug errado não dá erro, a
empresa só não aparece; confira abrindo o endereço no navegador. Prefira
empresas com vagas remotas ou no Brasil: um board com centenas de vagas
presenciais no exterior enche a fila com o que você não procura.

### Preenchimento de formulário

Usa um navegador baseado em Chromium já instalado na máquina: o app procura
Chrome, Brave, Edge, Chromium e Vivaldi nos lugares de instalação padrão, nessa
ordem. Se o seu estiver em outro lugar, informe o caminho do executável:

```env
FORM_FILL_BROWSER_PATH=/caminho/para/o/navegador
```

Firefox e Safari não servem: o Playwright não controla as versões
instaladas deles. O navegador abre com um perfil próprio, guardado em
`~/.local/share/job-tracker/`, fora da pasta do projeto — suas abas e logins
do dia a dia não são tocados. Se a plataforma
pedir login, faça pelo próprio Chrome que abrir; a sessão fica salva nesse
perfil. O app preenche nome, email, telefone e links, deixa em branco o que não
reconhece e **nunca envia**: você revisa e clica em enviar.

## Como funciona por dentro

### Decisões que valem a leitura

**O LinkedIn entra sem acessar o LinkedIn.** O `robots.txt` dele é
`Disallow: /` e o contrato proíbe acesso automatizado; o custo de um
banimento seria a rede profissional inteira. Mas o LinkedIn manda as vagas
por email, e ler a própria caixa não é acessar o site. O app lê os alertas e
nunca abre a página da vaga. Como o alerta não diz se a vaga ainda aceita
candidatura, a descoberta esconde vagas de alerta mais velhas que um limite
que você escolhe nos filtros (14 dias por padrão).

**O modelo sugere, você decide.** "Seguimos com outros candidatos" e
"gostaríamos de seguir com você" são quase a mesma frase com sentidos
opostos. A leitura do email vira uma sugestão no card, com o motivo ao lado,
e o status só muda no seu clique. No "Resolver por IA" vale o mesmo: o modelo
escolhe a candidatura por número, numa lista que o servidor montou, e o
servidor confere se a empresa aparece de fato no email. Proposta sem esse
apoio vem desmarcada.

**O "De" de um email não prova nada.** Qualquer um escreve
`no-reply@gupy.com.br` no remetente. O app lê o resultado que o servidor de
email grava em cada mensagem (SPF, DKIM e DMARC) e só vincula sozinho, e só
manda ao Claude, o email cujo remetente foi confirmado para aquele domínio.

**Conteúdo de terceiros é dado, nunca instrução.** Descrição de vaga, corpo de
email e página web podem trazer texto tentando manipular o modelo. Esse
conteúdo vai delimitado, e a saída do Claude é sempre um campo estruturado
validado com Zod, nunca algo que o sistema execute.

**Resposta de formulário não inventa experiência.** O modelo só afirma o que
está no currículo ou nas suas anotações e cita o trecho de onde tirou cada
coisa. O servidor confere, sem IA, se o trecho existe, aponta números que não
aparecem em lugar nenhum e expressões com cara de texto de IA.

**Formulário nunca é enviado automaticamente.** Candidatura enviada não tem
desfazer. O contrato da API afirma isso: o campo `submitted` é `false`
literal, não booleano. Não existe forma de expressar um envio.

**O funil conta quem já chegou, não quem está.** Uma candidatura que passou
por entrevista, teste e oferta tem status atual `oferta`; contar o status
atual apagaria as etapas anteriores. O funil vem do histórico de transições,
conta candidaturas distintas e nunca cresce de uma etapa para a seguinte.

**A data da mudança não é a data do clique.** A entrevista é marcada na
segunda e você registra na quarta. Sem separar as duas, "tempo até a primeira
resposta" mediria o seu hábito de registro, não a velocidade da empresa.

**Número vazio é melhor que número inventado.** Com poucas candidaturas, as
taxas de conversão são omitidas em vez de mostrar "75%" sobre quatro casos.

### Stack

TypeScript em tudo, num monorepo com npm workspaces.

| Camada     | Tecnologia                                       |
| ---------- | ------------------------------------------------ |
| Telas      | Next.js 16 (App Router), React 19, Tailwind 4, Motion |
| API        | Nest.js 11                                       |
| Banco      | PostgreSQL 16 + Prisma 7                         |
| Contratos  | Zod 4, compartilhados em `packages/shared`       |
| Email      | `imapflow` + `mailparser`                        |
| Navegador  | `playwright-core` com o Chrome do sistema        |
| IA         | `@anthropic-ai/sdk`, com saída estruturada       |

```
recruiter-frontend/   Next.js: telas; fala com a API só pelo servidor do Next
recruiter-backend/    Nest: API, banco, email, navegador, Claude
packages/shared/      Schemas Zod usados pelos dois lados
docker-compose.yml    Postgres local
```

Só a API fala com o banco. Todo contrato que cruza os dois apps vive em
`packages/shared`, e a API revalida toda entrada mesmo quando a tela já
validou: validação no cliente é conforto, não controle.

## Segurança

**Tudo escuta só em `127.0.0.1`:** a API, as telas e o Postgres. A API não
tem autenticação, o que é deliberado para um app pessoal e só é seguro porque
ninguém mais a alcança. Com as portas abertas na rede, qualquer pessoa no
mesmo Wi-Fi leria seu currículo e seus emails. O Postgres usa a senha padrão
do `.env.example`, que é pública; ela só é aceitável porque a porta não sai da
máquina.

Escutar só localmente não basta contra o próprio navegador: um site aberto
nele consegue mandar requisições para `127.0.0.1` e, com DNS rebinding, ler as
respostas. Por isso a API e as telas recusam qualquer `Host` que não seja
`127.0.0.1` ou `localhost`, e a API só aceita escrita com
`Content-Type: application/json`, o tipo de requisição que um site de fora não
consegue mandar sem o navegador pedir licença antes.

**Não publique este app num servidor** sem antes adicionar autenticação. Não é
uma mudança de configuração.

Credenciais ficam só nos arquivos `.env`, que estão no `.gitignore`.

## Desenvolvimento

```bash
npm run build                      # compila os três pacotes
npm run lint                       # lint dos três pacotes
npm test -w recruiter-backend      # testes da API
npm run db:migrate                 # cria uma migration depois de mudar o schema
npm run db:studio                  # navega pelo banco
```

- Rode `npm run build:shared` de novo sempre que mexer em `packages/shared`:
  os dois apps importam o código compilado dele. Depois, **reinicie a API**:
  o modo de desenvolvimento dela não percebe a mudança no pacote e continua
  com a versão antiga em memória.
- O `dev:worker` reinicia a API a cada arquivo salvo e, com
  `IMAP_SYNC_ON_BOOT=true`, sincronizaria o email a cada reinício. Durante o
  desenvolvimento, use `IMAP_SYNC_ON_BOOT=false`.

## Problemas comuns

**A porta 5432 já está em uso.** Outro Postgres está rodando na máquina. Mude
`POSTGRES_PORT` no `.env` da raiz e a porta do `DATABASE_URL` em
`recruiter-backend/.env`.

**A tela abre, mas nada carrega.** A API não está rodando, ou o `API_URL` em
`recruiter-frontend/.env.local` não aponta para ela. Use
`http://127.0.0.1:3333`, e não `localhost`: a API escuta só em IPv4.

**"Este app só atende em 127.0.0.1 ou localhost".** Você abriu o app por
outro endereço, como o IP da máquina na rede. É a proteção descrita
em [Segurança](#segurança); abra por `http://127.0.0.1:3000`.

**O rótulo do Gmail não é encontrado.** Falta marcar *Mostrar no IMAP* nas
configurações de marcadores, ou o nome em `IMAP_MAILBOX` não é igual ao do
rótulo.

**A IA responde "sem crédito".** A chave existe, mas a conta da Anthropic está
sem saldo. Adicione créditos em `console.anthropic.com`.

**"Importação indisponível: defina ANTHROPIC_API_KEY".** A linha existe no
`recruiter-backend/.env`, mas está vazia. Preencha com a chave (`sk-ant-...`,
sem aspas) e reinicie a API: o `.env` só é lido quando ela sobe.

**O `npm install` falha com E401.** O seu `~/.npmrc` global aponta para um
registry privado (de um trabalho anterior, por exemplo) com credencial
vencida. Instale pelo registry público, sem mexer no arquivo:
`npm install --registry=https://registry.npmjs.org/`.

**A busca trouxe bem menos vagas que antes.** Veja se há texto na caixa
*Filtrar por cargo ou tecnologia*: com texto, os portais procuram só ele, e a
vaga precisa ter a palavra no título. A tela mostra "Filtrando por …" com um
*limpar* ao lado. Sem texto, confira os termos de busca e o filtro de título
em *Filtros*.

**"O PDF quase não tem texto".** O currículo é uma imagem escaneada, sem
texto selecionável. Exporte de novo pelo editor (Word, Google Docs, Canva).
