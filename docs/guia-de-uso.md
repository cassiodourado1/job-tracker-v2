# Guia de uso e configuração

Este guia detalha as telas, as integrações opcionais e o agente diário.
Para instalar o projeto, consulte o [README](../README.md).

- [Telas](#o-menu-tela-por-tela)
- [Integrações](#configuração-opcional)
- [Agente diário](#agente-diário)
- [Problemas comuns](#problemas-comuns)

## O menu, tela por tela

O menu do topo tem sete itens. À direita fica o perfil escolhido e o botão
**Trocar perfil**. Os itens marcados com 🔑 usam a API da Anthropic e precisam
da chave; os demais recursos não dependem dela.

### Vagas

Onde você encontra vagas e decide o que fazer com cada uma. Tem duas abas,
fixas no topo ao rolar: **Buscar** e **Minhas vagas**.

![Busca de vagas com cards de várias fontes](images/vagas.png)

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

![Filtros da busca com termos, empresas acompanhadas e título](images/busca-filtros.webp)

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
| **Seleção do agente** | O que o agente encontrou e você ainda não enviou: primeiro as analisadas, da melhor aderência para a pior; depois as encontradas sem IA, marcadas como tal |
| **Para enviar** | Vagas salvas sem candidatura registrada |
| **Já me candidatei** | Vagas com candidatura registrada |
| **Todas** | Tudo o que está salvo |

![Seleção do agente em Minhas vagas, com veredito, resumo e currículo adaptado](images/selecao-do-agente.webp)

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
quatro painéis. Cada painel chama o Claude só quando você clica. Uma vaga que o
agente encontrou sem IA chega aqui sem análise: o **Analisar** do primeiro
painel é o passo pago, quando você decidir. O contexto inclui o currículo
profissional e, quando preenchido, o histórico profissional.

![Aderência ao currículo: veredito, o que você já mostra e o que falta](images/aderencia.webp)

![Currículo adaptado para a vaga e preparação para entrevista](images/curriculo-e-entrevista.webp)

- **Aderência ao seu currículo** 🔑: o veredito (forte, boa, parcial ou
  fraca), o que você já mostra, com o trecho do currículo que prova, e o que
  falta, com como contornar. Trecho que o servidor não acha no currículo vem
  marcado como *confira*. A análise fica guardada: ao voltar à página ela já
  está lá, e **Analisar de novo** substitui. É a chamada mais cara do app.
- **Currículo para esta vaga** 🔑: **Adaptar** reescreve o resumo e as
  experiências para destacar o que a vaga pede e reordena as habilidades. A proposta deve se apoiar no currículo e no histórico profissional; o que
  a vaga pede e esses registros não mostram fica listado à parte. As verificações
  automáticas ajudam na revisão, mas não garantem que toda afirmação esteja correta. Revise e use **Salvar esta versão**; **Ver e salvar PDF** abre a
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

![Painel do Mercado](images/mercado.webp)

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

![Hoje: emails que pedem ação, com prazo, e follow-ups](images/hoje.webp)

- **Emails**: o estado da leitura do Gmail (última sincronização, rodada em
  andamento ou com falha) e o botão **Sincronizar agora**. Com os dados
  desatualizados, a tela não diz "sem pendências".
- **Emails que podem exigir ação**: convites para entrevista, etapas de teste
  e candidaturas incompletas, com o prazo quando o email diz um. Prazo
  próximo vem primeiro. **Abrir email** leva ao Gmail; dispensar tira o aviso
  da lista, com *desfazer*. Detalhes em
  [docs/email-action-alerts.md](email-action-alerts.md).
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
sincronizar emails já vinculados a uma candidatura, ou quando você roda o
[agente diário](#agente-diário) com `--com-ia`. Cada função usa o modelo que cabe nela:

| Função | Modelo | Custo relativo |
| --- | --- | --- |
| Ler vaga por link, email, currículo em PDF; sugerir status; Resolver por IA | Haiku | baixo |
| Currículo adaptado, preparação para entrevista, perguntas do formulário | Sonnet | médio |
| Aderência entre a vaga e o currículo | Opus | alto |

A aderência usa o modelo de maior custo relativo e o currículo inteiro.
O agente diário com `--com-ia` pode executar dezenas de análises numa rodada;
sem essa opção, ele não chama o Claude.
Acompanhe o consumo no [console da Anthropic](https://console.anthropic.com/).
Algumas funções têm limites locais de chamadas por minuto. Esses limites
não são um orçamento financeiro nem impedem gastos em novas execuções.

O que sai da sua máquina:

- **Emails:** a classificação usa emails vinculados e com remetente verificado.
  No **Resolver por IA**, emails pendentes verificados também são enviados para
  propor o vínculo ou uma nova candidatura. O app não envia a caixa inteira.
- **Currículo:** a parte profissional, sem os campos de identificação do perfil.
  O histórico profissional e as anotações também podem compor o contexto;
  evite colocar dados pessoais nesses campos livres. Na importação de PDF, o texto
  é extraído na sua máquina e passa por remoção de dados pessoais antes de ir ao
  Claude. Essa remoção não garante anonimização completa; email, telefone e links preenchem o perfil direto. A cidade
  fica, para a busca achar vagas locais.
- **Vagas:** o texto da vaga que você está usando.

As respostas de formulário vêm, por padrão, como tópicos para você escrever
com suas palavras. Revise também os rascunhos e currículos adaptados antes de usar.

### Email (Gmail)

A leitura usa um **rótulo** do Gmail, nunca a caixa de entrada inteira: o
próprio Gmail garante esse limite antes de o app ver qualquer email.

1. Ative a verificação em duas etapas na conta Google.
2. Gere uma **senha de app** em [Senhas de app do Google](https://myaccount.google.com/apppasswords). Nunca use
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

### Rebase Jobs

A Rebase Jobs é consultada junto com as outras fontes de busca. Para ativá-la,
crie um token pessoal na página de API da Rebase e coloque-o no
`recruiter-backend/.env`:

```env
REBASE_JOBS_TOKEN=seu-token-pessoal
```

Reinicie o backend para carregar a variável. Sem token, a fonte fica desligada.
Uma busca digitada é enviada como texto; sem texto, o app envia as tecnologias
compatíveis com os filtros da Rebase. A resposta é limitada a 50 vagas por
busca e só fica no resultado da descoberta: nada é importado para o banco até
você salvar a vaga. A Rebase publica limite de 60 consultas por minuto.

O comando `claude mcp add ...` configura o Claude no VS Code, não o Job Tracker.
Para este app, use `REBASE_JOBS_TOKEN` no `.env` do backend. Se o token aparecer
em chat, terminal compartilhado ou repositório, revogue-o e crie outro.

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

Um script que roda sozinho todo dia, procura vagas novas e as deixa dentro do
app, em *Vagas → Minhas vagas → Seleção do agente*. **Por padrão ele não chama
o Claude e não gasta nada**: você escolhe no app quais vagas analisar. O
agendamento e a notificação são para macOS (`launchd` e `osascript`).

O que ele faz numa execução normal, nesta ordem:

1. Lê a busca inteira da API local, das vagas mais novas para as mais antigas.
   A busca já aplica o filtro do seu perfil (termos, título, tecnologias,
   modalidade, contrato, senioridade, localização, idade dos alertas do
   LinkedIn), junta anúncios repetidos e tira o que você salvou, aplicou ou
   descartou.
2. Descarta, pelo título, o que é claramente de outra trilha (back-end em outra
   linguagem, infraestrutura, dados, QA, mobile nativo), a não ser que o título
   também fale de front-end. Essa regra fica no script, voltada a front-end e
   web, e não nos filtros do perfil.
3. Fica só com as vagas publicadas nos últimos 21 dias, ou sem data.
4. Salva as N mais novas em *Minhas vagas*, marcadas **"Encontrada pelo
   agente, sem IA"**. Nenhum veredito é inventado: a vaga só passou pelos
   filtros.
5. Avisa por notificação do Mac quantas vagas encontrou e quantos emails pedem
   ação.

Para analisar uma vaga encontrada, abra a página dela e clique em **Analisar**
no painel *Aderência ao seu currículo*. Esse é o passo pago, e só acontece no
seu clique. O mesmo vale para o currículo adaptado e a preparação para
entrevista.

O que ele **nunca** faz: candidatar, enviar formulário, descartar vaga, mudar
status de candidatura ou acessar o LinkedIn. Ele prepara; quem envia é você.

Ele guarda em `~/agente-vagas/estado.json` as vagas que já salvou, para não
repetir uma vaga que você tirou de *Minhas vagas*. Esse registro não é separado
por perfil. Se a API estiver parada, o agente a inicia e a encerra no fim; no
modo normal ela sobe **sem a chave da Anthropic**, então a sincronização de
emails do início lê os emails mas não chama o Claude para classificá-los.

### Agendar e remover

Para agendar (exemplo: às 9h, até 10 vagas novas por dia):

```bash
scripts/instalar-agente-diario.sh 9 10
```

O agendamento **sempre roda sem IA**: o instalador não aceita `--com-ia`. Para
tirar o agendamento:

```bash
scripts/instalar-agente-diario.sh --remover
```

Para rodar agora, sem esperar o horário:

```bash
node scripts/agente-diario.mjs --top 10
```

### Análise automática por IA (opcional, paga)

Só roda quando você pede na linha de comando. Com `--com-ia`, cada vaga
filtrada é salva e passa pela análise de aderência (Opus, a chamada mais cara
do app), uma a uma, até achar a meta de vagas **forte** ou **boa** ou bater o
teto de análises. Se o crédito acabar ou a chave for recusada, a rodada para.

```bash
node scripts/agente-diario.mjs --com-ia --top 5 --teto 30
```

O currículo adaptado automático pede uma opção a mais, e só é gerado para
vagas forte ou boa:

```bash
node scripts/agente-diario.mjs --com-ia --com-curriculo --max-curriculos 5
```

| Opção | O que faz |
| --- | --- |
| `--top N` | Sem IA: quantas vagas novas salvar (até 50, padrão 10). Com IA: a meta de vagas forte ou boa (padrão 5) |
| `--com-ia` | Liga a análise de aderência paga para cada vaga filtrada |
| `--teto N` | Com `--com-ia`: máximo de **análises** por execução (até 500, padrão 60). Limita a quantidade, não o valor em dinheiro; sem `--com-ia`, é ignorado |
| `--com-curriculo` | Com `--com-ia`: gera o currículo adaptado das vagas forte ou boa. Sozinho, é recusado |
| `--max-curriculos N` | Com `--com-curriculo`: máximo de currículos por execução (até 100, padrão 10) |
| `--sem-aviso` | Não mostra a notificação |

Opção digitada errada (por exemplo `--com-IA`) faz o agente parar com erro, em
vez de rodar de um jeito que você não pediu. Com IA, cada análise custa em
torno de alguns centavos de dólar, e o teto é por execução, não por dia:
acompanhe o gasto no [console da Anthropic](https://console.anthropic.com/).

O log e a memória do agente ficam em `~/agente-vagas`, fora do projeto.

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
em [Segurança](../README.md#segurança-e-privacidade); abra por `http://127.0.0.1:3000`.

**O rótulo do Gmail não é encontrado.** Falta marcar *Mostrar no IMAP* nas
configurações de marcadores, ou o nome em `IMAP_MAILBOX` não é igual ao do
rótulo.

**O build falha ao baixar fontes.** O frontend usa `next/font/google` e
precisa acessar o Google Fonts durante o build. Verifique a conexão e as
configurações de proxy; o build não é totalmente offline.

**Node incompatível.** Use a versão indicada por `nvm use` (Node 22.12+ na
linha 22). O requisito do Prisma é mais restrito que o do Next.js.

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
