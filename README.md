# job-tracker

Rastreador pessoal de candidaturas a vagas de emprego. Encontra vagas, lê os
emails dos processos seletivos, ajuda a preencher formulários e mostra o que
acontece depois que você se candidata.

> **Roda só na sua máquina.** É um app para uma pessoa, sem login e sem
> deploy: você clona, sobe e usa em `127.0.0.1`. A API não tem autenticação
> de propósito, e isso só é seguro porque nada fica exposto na rede. Não
> publique num servidor. Mais em [Segurança](#segurança).

![Painel do Mercado: vagas publicadas nos últimos 7 dias, por fonte, por dia, por empresa e por tecnologia](docs/images/mercado.png)

<p align="center">
  <a href="#o-ciclo-de-uma-vaga">Como funciona</a> ·
  <a href="#começando">Começando</a> ·
  <a href="#o-menu-tela-por-tela">Tela por tela</a> ·
  <a href="#agente-diário">Agente diário</a> ·
  <a href="#como-funciona-por-dentro">Por dentro</a> ·
  <a href="#problemas-comuns">Problemas comuns</a>
</p>

## Por que existe

O difícil de procurar emprego não é a ferramenta, é o atrito de registrar
cada candidatura. Se cadastrar uma vaga leva mais de trinta segundos, a
planilha é abandonada na terceira semana, e com ela a única forma de saber o
que está funcionando.

A ideia aqui é registrar sem digitar. A vaga vem da descoberta, a confirmação
de candidatura vem do email, e quando a empresa responde o Claude lê o email e
sugere o novo status. Você confirma com um clique.

### O ciclo de uma vaga

```mermaid
flowchart LR
    subgraph Fontes
        P["Portais<br/>Gupy, Remotar, Nerdin,<br/>GeekHunter, Programathor"]
        E["Empresas acompanhadas<br/>Gupy, InHire, Greenhouse,<br/>Lever, Ashby, Workday"]
        A["Alertas do LinkedIn<br/>pelo seu email"]
    end

    P --> D{{"Descoberta<br/>filtros do perfil"}}
    E --> D
    A --> D
    D --> M["Mercado<br/>números por período"]
    D --> V["Vagas<br/>salvar ou descartar"]
    V --> J["Página da vaga<br/>aderência, currículo adaptado,<br/>preparação para entrevista"]
    J --> C["Candidatura<br/>com o currículo enviado congelado"]
    G["Emails do processo<br/>rótulo do Gmail"] --> S["Claude sugere<br/>o novo status"]
    S -->|"você confirma"| C
    C --> H["Hoje e Métricas<br/>follow-ups e funil"]
```

Cada caixa é uma tela ou uma etapa. O Claude só entra onde há uma seta para
ele, e nenhuma sugestão vira dado sem o seu clique.

## O que ele faz

| Funcionalidade | Precisa de chave da Anthropic? |
| --- | --- |
| Candidaturas: cadastro, status, histórico, busca, filtros e ordenação | não |
| Descoberta de vagas em Gupy, Remotar, Nerdin, Programathor, GeekHunter, Greenhouse, Lever, Ashby, agregadores remotos, portais brasileiros e alertas do LinkedIn | não |
| Empresas acompanhadas: todas as vagas de empresas que você escolhe, na Gupy, InHire, Greenhouse, Lever, Ashby ou Workday | não |
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
| Aderência entre uma vaga e o seu currículo: o que você já mostra, o que falta e como contornar | sim |
| Currículo adaptado para uma vaga, sem acrescentar nada que o currículo não tenha, salvo como a versão enviada naquela candidatura | sim |
| Preparação para entrevista: perguntas prováveis com pontos de resposta do seu currículo, o que estudar e o que perguntar à empresa | sim |
| Agente diário: procura vagas boas para você todo dia e deixa o resultado em *Minhas vagas* | sim |

Sem a chave, tudo da primeira metade funciona. Com ela, o Claude entra só onde
você pede, e o que ele propõe passa pelo seu clique antes de virar dado.

## Requisitos

- **Node.js 20.9 ou mais novo** e npm. O repositório traz um `.nvmrc`: com
  [nvm](https://github.com/nvm-sh/nvm), `nvm use` na pasta escolhe a versão certa.
  Com Node 18 o Prisma quebra logo ao iniciar (`styleText is not a function`).
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
   de dados que o LinkedIn exporta (*Configurações → Privacidade dos dados →
   Baixe seus dados*, primeira opção; o pacote menor, só com "Perfil", não
   traz cargos nem formação). Nos dois casos o formulário é preenchido para
   você revisar, e nada é gravado até você salvar.
3. **Procure vagas** em *Vagas*. Em *Filtros* ficam os **termos de busca**
   (o que os portais procuram: sem "front-end" ali, vaga de front-end nem
   chega), o título, a modalidade, o contrato e as **empresas acompanhadas**.
   Salve as vagas que interessam e descarte o resto. A caixa *Filtrar por
   cargo ou tecnologia* restringe a busca ao texto digitado, e a tela avisa
   enquanto ela estiver em uso.
4. **Registre candidaturas** em *Candidaturas*, ou deixe que venham dos
   emails (veja abaixo).

## O menu, tela por tela

O menu do topo tem sete itens. À direita fica o perfil escolhido e o botão
**Trocar perfil**. Os itens marcados com 🔑 chamam o Claude e precisam da
chave da Anthropic; todo o resto funciona sem ela.

### Vagas

Onde você encontra vagas e decide o que fazer com cada uma. Tem duas abas,
fixas no topo ao rolar: **Buscar** e **Minhas vagas**.

![Busca de vagas com cards de várias fontes](docs/images/vagas.png)

**Buscar** junta numa lista só as vagas de todas as fontes: portais (Gupy,
Remotar, Nerdin, GeekHunter, Programathor e outros), empresas acompanhadas e
alertas do LinkedIn que chegam por email.

- **Buscar** consulta as fontes de novo. O contador ao lado do título diz
  quantas vagas passaram nos seus filtros e quantas estão na tela; mais vagas
  chegam conforme você rola.
- **Ampliar a área de busca** liga também as fontes lentas, que leem o portal
  página a página. Leva alguns segundos a mais.
- **Filtrar por cargo ou tecnologia** restringe a busca ao texto digitado. A
  tela avisa enquanto ele estiver ativo, com um *limpar* ao lado.
- **Ordenar**: mais recentes (o padrão: vaga nova tem menos concorrência),
  relevância para o seu currículo, empresa ou cargo.
- **Já tem o link de uma vaga? Extrair de um link** 🔑: cole o endereço e o
  Claude lê a página e preenche a vaga para você revisar e salvar.
- Clique no **nome da empresa** num card para ver só as vagas dela. Anúncios
  repetidos da mesma vaga em sites diferentes viram um card só, com a contagem
  de "anúncios iguais".

Cada card tem quatro botões:

| Botão | O que faz |
| --- | --- |
| **Ver** | Abre a vaga no site de origem |
| **✕** | Descarta a vaga: ela some da busca deste perfil, com *desfazer* |
| **Já me candidatei** | Salva a vaga e registra a candidatura como enviada, com a data de hoje |
| **Salvar** (marcador) | Guarda a vaga em *Minhas vagas* para decidir depois |

**Filtros** abre o modal com o que decide quais vagas chegam:

![Modal de filtros com termos de busca e empresas acompanhadas](docs/images/filtros.png)

- **Termos de busca**: o que os portais procuram (até 6). Sem "front-end"
  aqui, vaga de front-end nem entra na lista.
- **Empresas acompanhadas**: cole o endereço da página de vagas da empresa e
  todas as vagas dela entram, não só as que casam com os termos. A
  plataforma é reconhecida na hora (veja [a tabela](#empresas-acompanhadas-na-descoberta)).
- **Título precisa conter** e **Título não pode conter**: palavras exigidas
  ou proibidas no título da vaga.
- **Localização** (Brasil ou internacional), **Estado**, **Modalidade**,
  **Contrato**, **Senioridade** e **Tecnologias**.
- **Vagas do LinkedIn**: a idade máxima dos alertas. O alerta não diz se a
  vaga ainda aceita candidatura, então as velhas ficam de fora.

**Minhas vagas** são as vagas que você salvou (ou que o
[agente diário](#agente-diário) salvou para você). Elas continuam aqui depois
de aplicadas. Os filtros do topo separam a lista:

| Filtro | O que mostra |
| --- | --- |
| **Seleção do agente** | O que o agente analisou e você ainda não enviou, da melhor aderência para a pior |
| **Para enviar** | Vagas salvas sem candidatura registrada |
| **Já me candidatei** | Vagas com candidatura registrada |
| **Todas** | Tudo o que está salvo |

O card mostra a aderência e o resumo da análise, quando houver, com os links
**Ver análise completa** e **Currículo adaptado**. Os botões:

| Botão | O que faz |
| --- | --- |
| **Ver** | Abre a vaga no site da empresa |
| **Preencher** | Abre a vaga num navegador e preenche nome, email, telefone e links. **Nunca envia**: você revisa, anexa o currículo e clica em enviar |
| **Já me candidatei** | Registra a candidatura depois que você enviou no site. Vira **Acompanhar candidatura** |
| **Lixeira** | Remove a vaga de *Minhas vagas* (pede confirmação) |

**Página da vaga.** Clique no nome da empresa ou do cargo num card de *Minhas
vagas* para abrir a página da vaga no app. Ela tem os detalhes da vaga, a
barra **Já me candidatei** (ou o status da candidatura, se já existir) e
quatro painéis. Cada painel só chama o Claude no clique, e o Claude recebe só
a parte profissional do currículo, sem nome nem contatos.

![Painéis de IA na página da vaga](docs/images/vaga.png)

- **Aderência ao seu currículo** 🔑: o veredito (forte, boa, parcial ou
  fraca), o que você já mostra, com o trecho do currículo que prova, e o que
  falta, com como contornar. Trecho que o servidor não acha no currículo vem
  marcado como *confira*. A análise fica guardada: ao voltar à página ela já
  está lá, e **Analisar de novo** substitui. É a chamada mais cara do app.
- **Currículo para esta vaga** 🔑: **Adaptar** reescreve o resumo e as
  experiências para destacar o que a vaga pede e reordena as habilidades. Não
  acrescenta nada: o que a vaga pede e o currículo não mostra fica listado à
  parte. Revise e use **Salvar esta versão**; **Ver e salvar PDF** abre a
  versão para imprimir. É essa versão que fica registrada como o currículo
  enviado quando você marca a candidatura.
- **Preparação para entrevista** 🔑: conte como é a etapa (opcional, ex.:
  "técnica com o tech lead") e clique em **Preparar**. Vêm as perguntas
  prováveis com pontos de resposta tirados do seu currículo, o que estudar
  antes e o que perguntar à empresa. Fica guardada para você reler no dia.
- **Perguntas do formulário** 🔑: cole uma pergunta aberta da candidatura
  ("Por que você quer trabalhar conosco?"). Em **Tópicos** (recomendado) o
  Claude diz o que responder e com quais fatos, e você escreve; em
  **Rascunho** ele escreve um texto para você editar. Dá para escolher
  português, inglês ou espanhol e pedir uma versão curta. O servidor confere
  a resposta sem IA e aponta números que não estão no currículo, afirmações
  sem trecho correspondente, o que a vaga pede e você não mostra, expressões
  com cara de texto de IA e respostas acima do limite.

### Mercado

A página inicial. Responde "como está o mercado nos meus filtros?" antes de
qualquer clique, sem IA.

![Painel do Mercado](docs/images/mercado.png)

- **Período**: últimas 24 horas, 7 dias ou 30 dias.
- Totais: **vagas publicadas** (uma vaga em vários sites conta uma vez),
  **remotas**, **empresas contratando** e **sem data de publicação** (passam
  nos filtros, mas ficam fora dos números).
- **Qual site tem mais vagas**: vagas por fonte.
- **Vagas publicadas por dia**: empilhadas por fonte, pelo horário de
  Brasília. **Ver tabela** mostra os números.
- **Empresas que mais publicaram** (as 10 primeiras), **Tecnologias mais
  pedidas** e **Modalidade**.

Use para decidir o que estudar (as tecnologias mais pedidas) e onde procurar
(as fontes e empresas com mais vagas).

### Hoje

O que pede ação hoje, numa tela só:

- **Emails**: o estado da leitura do Gmail (última sincronização, rodada em
  andamento ou com falha) e o botão **Sincronizar agora**. Com os dados
  desatualizados, a tela não diz "sem pendências".
- **Emails que podem exigir ação**: convites para entrevista, etapas de teste
  e candidaturas incompletas, com o prazo quando o email diz um. Prazo
  próximo vem primeiro. **Abrir email** leva ao Gmail; dispensar tira o aviso
  da lista, com *desfazer*. Detalhes em
  [docs/email-action-alerts.md](docs/email-action-alerts.md).
- **Follow-ups**: candidaturas paradas há tempo demais no mesmo status. Marque
  que fez o follow-up ou adie o lembrete.
- **Emails com sugestão de status** 🔑: o Claude leu um email e sugere mudar o
  status de uma candidatura. Confirme em *Candidaturas*.
- **Candidaturas por status** e um atalho para as vagas salvas que esperam
  candidatura.
- **Confira também os emails fora do filtro**: aparece se você configurou
  `RECRUITING_RESCUE_SENDERS`, e abre essa busca no Gmail.

### Candidaturas

Todas as candidaturas do perfil, com o status de cada uma.

- **Registrar candidatura**: empresa, cargo, link, status, notas,
  senioridade, modalidade, local e a data em que foi registrada.
- **Buscar e filtrar**: por texto, pelo período de cadastro (7, 30 ou 90 dias,
  ou um período seu) e pela ordem (mais recentes, mais antigas, mais
  avançadas no funil ou começo do funil).
- **Mudar status**: rascunho, aplicado, triagem, entrevista, teste, oferta,
  rejeitado ou cancelado. Cada mudança entra no **Histórico** da candidatura,
  com **quando aconteceu** (que pode ser diferente de quando você registrou)
  e a origem: você, um email ou uma sugestão de IA confirmada. **Ler o email**
  abre o email que motivou a mudança.
- **Sugestão de status a partir de um email** 🔑: quando o Claude lê uma
  resposta da empresa, a sugestão aparece no card com o motivo. Nada muda
  sem o seu clique.
- **Ver detalhes**, **Editar** e **Excluir**. Candidatura excluída some da
  lista e das métricas.
- **Responder perguntas do formulário** 🔑: o mesmo painel da página da vaga.

### Currículo

O seu currículo estruturado, de onde saem o PDF, as análises e as respostas.

- **Importar currículo (PDF)** 🔑: o texto é extraído na sua máquina e perde
  nome, contatos e documentos antes de ir ao Claude, que preenche o
  formulário para você revisar. Também dá para importar o **arquivo de dados
  do LinkedIn**, sem IA.
- **Dados pessoais**, **Resumo**, **Experiências**, **Formação**,
  **Competências**, **Projetos**, **Idiomas** e **Certificações**. Nada é
  gravado até você clicar em **Salvar**.
- **Histórico profissional**: fatos verdadeiros da sua trajetória que não
  couberam no currículo, e a lista do que você **não** quer mostrar. As
  análises e respostas usam o histórico como prova, e nunca sugerem o que
  está na lista de excluídos.
- **Ver e salvar PDF**: abre o currículo pronto para imprimir em PDF pelo
  navegador.

### Emails

Os emails do rótulo do Gmail que ainda não estão ligados a uma candidatura.

- **Sincronizar agora**: lê os emails novos do rótulo.
- Em cada email: **Registrar candidatura** a partir dele, vincular a uma
  candidatura existente ou **Remover da lista** (com *desfazer*; o Gmail não
  é alterado).
- **Resolver por IA** 🔑: selecione vários emails e o Claude propõe um plano
  (criar candidaturas, vincular a existentes, ignorar). Você revisa o plano e
  aplica, ou **Descarta plano**. Só vão ao Claude emails com remetente
  verificado.

### Métricas

O que aconteceu depois que você se candidatou, calculado a partir do
histórico, sem IA.

- Totais: **ativas**, **responderam**, **rejeitadas**, **em rascunho**,
  **vagas recebidas**, **salvas**, **dispensadas** e **emails**.
- **Funil**: quantas candidaturas chegaram a cada etapa. Conta quem já passou
  pela etapa, não só quem está nela agora.
- **Tempo até a primeira resposta**, **Emails por dia** e **Vagas recebidas
  por dia**.
- **O que cada fonte rendeu** e **De onde vieram suas candidaturas**: qual
  site trouxe vagas que você aproveitou.

Com poucas candidaturas, as taxas de conversão ficam ocultas em vez de mostrar
uma porcentagem sobre quatro casos.

## Configuração opcional

Tudo abaixo fica em `recruiter-backend/.env`. Depois de mudar o arquivo,
reinicie a API.

### Claude (Anthropic)

```env
ANTHROPIC_API_KEY=sua-chave
```

A chave precisa de crédito: sem saldo, a API responde erro e a tela avisa.

O app só chama o Claude quando você pede (um clique, uma seleção), ao
sincronizar emails já vinculados a uma candidatura, ou quando o
[agente diário](#agente-diário) roda. Cada função usa o modelo que cabe nela:

| Função | Modelo | Custo relativo |
| --- | --- | --- |
| Ler vaga por link, email, currículo em PDF; sugerir status; Resolver por IA | Haiku | baixo |
| Currículo adaptado, preparação para entrevista, perguntas do formulário | Sonnet | médio |
| Aderência entre a vaga e o currículo | Opus | alto |

A aderência é a chamada cara: é julgamento sobre o currículo inteiro. Uma
análise por clique pesa pouco, mas o agente diário pode fazer dezenas num dia.
Defina um limite de gasto mensal em `console.anthropic.com` (*Billing*) antes
de ligar o agente. Cada função tem também um teto de chamadas por minuto, e
passar dele devolve um aviso em vez de cobrar.

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
| Workday | `empresa.wd5.myworkdayjobs.com/SiteDeVagas` |

Muitas empresas não têm sistema de vagas próprio: a página "Vagas" do site
mostra vagas hospedadas numa dessas plataformas. Abra uma vaga no site da
empresa e veja para onde o link aponta. O site da CI&T, por exemplo, já é
reconhecido e lido pela Lever dela.

Na Workday, onde ficam empresas grandes como a Accenture, o app lê só as vagas
do Brasil e só a lista: sem descrição, porque a Workday bloqueia por alguns
minutos quem faz muitas consultas seguidas. Empresas em SuccessFactors ou
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

Usa um navegador baseado em Chromium já instalado na máquina, nesta ordem:

1. o caminho em `FORM_FILL_BROWSER_PATH`, se você informar;
2. o seu navegador padrão (macOS, Linux ou Windows), se for Chrome, Brave,
   Edge, Chromium ou Vivaldi;
3. o primeiro desses que estiver instalado no lugar padrão;
4. o Chromium do próprio Playwright, se você o instalou.

```env
FORM_FILL_BROWSER_PATH=/caminho/para/o/navegador
```

Firefox e Safari não servem: o Playwright não controla as versões
instaladas deles. Se você só tem um deles, instale o Chromium do Playwright
(é um download grande, que fica fora da pasta do projeto):

```bash
cd recruiter-backend
npx playwright-core install chromium
```

O navegador abre com um perfil próprio, guardado em
`~/.local/share/job-tracker/`, fora da pasta do projeto: suas abas e logins
do dia a dia não são tocados. Se a plataforma
pedir login, faça pelo próprio navegador que abrir; a sessão fica salva nesse
perfil. O app preenche nome, email, telefone e links, deixa em branco o que não
reconhece e **nunca envia**: você revisa e clica em enviar.

## Agente diário

Um script que roda sozinho todo dia, procura vagas boas para você e deixa o
resultado dentro do app, em *Vagas → Minhas vagas → Seleção do agente*. Precisa
da chave da Anthropic e funciona só no macOS (o agendamento usa o `launchd`).

O que ele faz, nesta ordem:

1. Lê a busca inteira da API local, das vagas mais novas para as mais antigas
   (até 21 dias), com os filtros do seu perfil.
2. Descarta de graça, pelo título, o que é claramente de outra trilha
   (back-end em outra linguagem, infraestrutura, dados, QA, mobile nativo).
   Se o título também falar de front-end, a vaga fica.
3. Salva e analisa a aderência de cada vaga, uma a uma, até achar a meta de
   vagas **forte** ou **boa**, ou até bater o teto de análises do dia.
4. Para as vagas forte ou boa, gera e salva o currículo adaptado.
5. Avisa por notificação do Mac quantas vagas analisou e quantos emails pedem
   ação.

O que ele **nunca** faz: candidatar, enviar formulário, descartar vaga, mudar
status de candidatura ou acessar o LinkedIn. Ele prepara; quem envia é você.

Ele lembra o que já analisou e não repete. O primeiro dia é o mais caro; nos
seguintes, só as vagas novas entram. Se o crédito acabar ou a chave for
recusada, ele para na hora. Vaga sem descrição é pulada sem gastar análise.

Para agendar (exemplo: às 9h, meta de 10 vagas boas, no máximo 60 análises):

```bash
scripts/instalar-agente-diario.sh 9 10 60
```

Para rodar agora, sem esperar o horário:

```bash
node scripts/agente-diario.mjs --top 10 --teto 60
```

| Opção | O que faz |
| --- | --- |
| `--top N` | Meta: quantas vagas forte ou boa encontrar (até 50) |
| `--teto N` | Máximo de análises pagas no dia (até 500, padrão 60) |
| `--sem-curriculo` | Analisa, mas não gera currículo adaptado |
| `--sem-analise` | Só lista as vagas da triagem, sem chamar o Claude |
| `--sem-aviso` | Não mostra a notificação |

Se a API não estiver rodando, o agente sobe uma e a derruba no fim. O log e a
memória do agente ficam em `~/agente-vagas`, fora do projeto. Para tirar o
agendamento: `scripts/instalar-agente-diario.sh --remover`.

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

<details>
<summary>Como um email vira status, passo a passo</summary>

```mermaid
sequenceDiagram
    autonumber
    participant G as Gmail (rótulo job-tracker)
    participant API as API local
    participant C as Claude
    participant T as Você, na tela
    API->>G: lê só o rótulo, por IMAP
    API->>API: confere SPF, DKIM e DMARC do remetente
    alt remetente confirmado
        API->>API: vincula à candidatura da empresa
        API->>C: corpo do email, delimitado como dado
        C-->>API: sugestão estruturada, validada com Zod
        API-->>T: card com a sugestão e o motivo
        T->>API: confirma (ou ignora)
        API->>API: grava o status e o evento no histórico
    else remetente não confirmado
        API-->>T: email fica para vínculo manual
    end
```

</details>

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

```mermaid
stateDiagram-v2
    direction LR
    [*] --> rascunho
    rascunho --> aplicado
    aplicado --> triagem
    triagem --> entrevista
    entrevista --> teste
    teste --> oferta
    aplicado --> rejeitado
    triagem --> rejeitado
    entrevista --> rejeitado
    teste --> rejeitado
    oferta --> [*]
    rejeitado --> [*]
```

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

```mermaid
flowchart LR
    B["Navegador"] -->|"127.0.0.1:3000"| N["Next.js<br/>telas e server actions"]
    N -->|"127.0.0.1:3333<br/>JSON"| A["Nest.js<br/>API"]
    A --> DB[("PostgreSQL<br/>Docker, 127.0.0.1")]
    A --> IMAP["Gmail<br/>IMAP"]
    A --> CL["Claude<br/>API da Anthropic"]
    A --> PT["Portais e<br/>plataformas de vagas"]
    A --> PW["Navegador do sistema<br/>Playwright, nunca envia"]
    S["packages/shared<br/>schemas Zod"] -.-> N
    S -.-> A
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

<details>
<summary>Abrir a lista</summary>

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

</details>
