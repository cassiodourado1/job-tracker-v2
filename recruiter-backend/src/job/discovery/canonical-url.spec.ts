import { canonicalJobUrl } from './canonical-url';

/**
 * A URL é a identidade de uma vaga externa: chave do `Job.url @unique`, do
 * "já salva", e do `DismissedJob.jobUrl`.
 *
 * Errar aqui não devolve uma string feia — cria vaga duplicada no lote e vaga
 * que não some quando você dispensa.
 */

const ID = '1234567890';
const ESPERADO = `https://www.linkedin.com/jobs/view/${ID}`;

describe('canonicalJobUrl · LinkedIn', () => {
  it('colapsa /comm/ na forma pública', () => {
    // As duas são a mesma vaga: /comm/ é o que vem nos emails de alerta,
    // /jobs/view/ é o que você vê no navegador.
    expect(
      canonicalJobUrl(`https://www.linkedin.com/comm/jobs/view/${ID}/`),
    ).toBe(ESPERADO);
    expect(canonicalJobUrl(`https://www.linkedin.com/jobs/view/${ID}`)).toBe(
      ESPERADO,
    );
  });

  it('descarta os parâmetros de rastreio', () => {
    // Estes não são só ruído: `midToken`, `otpToken` e `eid` identificam a
    // CONTA de quem recebeu o email. Não podem chegar ao banco nem ao log.
    const comRastreio = `https://www.linkedin.com/comm/jobs/view/${ID}/?trackingId=AAA%3D%3D&refId=BBB&midToken=CCC&midSig=DDD&trk=eml-x&trkEmail=eml-y&eid=eee-fff-gg&otpToken=HHHH`;

    const saida = canonicalJobUrl(comRastreio);

    expect(saida).toBe(ESPERADO);
    expect(saida).not.toContain('?');
    expect(saida).not.toContain('otpToken');
    expect(saida).not.toContain('midToken');
  });

  it('aceita subdomínio de país', () => {
    // `br.linkedin.com` é o que sai de uma sessão deslogada. Um mapa estático
    // de hosts não cobriria isso.
    expect(canonicalJobUrl(`https://br.linkedin.com/jobs/view/${ID}`)).toBe(
      ESPERADO,
    );
    expect(
      canonicalJobUrl(`https://pt.linkedin.com/comm/jobs/view/${ID}/`),
    ).toBe(ESPERADO);
    expect(canonicalJobUrl(`https://linkedin.com/jobs/view/${ID}`)).toBe(
      ESPERADO,
    );
  });

  it('tolera o slug antes do id', () => {
    expect(
      canonicalJobUrl(
        `https://www.linkedin.com/jobs/view/desenvolvedor-back-end-at-acme-${ID}`,
      ),
    ).toBe(ESPERADO);
  });

  it('recusa caminho que não identifica UMA vaga', () => {
    // O caso perigoso: a query é descartada antes, então /jobs/search/
    // viraria uma identidade única compartilhada por todas as vagas abertas
    // a partir da busca. `null` vira erro tratado em vez de colisão calada.
    expect(
      canonicalJobUrl(
        `https://www.linkedin.com/jobs/search/?currentJobId=${ID}`,
      ),
    ).toBeNull();
    expect(canonicalJobUrl('https://www.linkedin.com/feed/')).toBeNull();
    expect(canonicalJobUrl('https://www.linkedin.com/in/alguem')).toBeNull();
  });

  it('é idempotente', () => {
    // A saída volta como entrada a cada rodada de descoberta.
    const uma = canonicalJobUrl(
      `https://www.linkedin.com/comm/jobs/view/${ID}/?trk=x`,
    );

    expect(canonicalJobUrl(uma as string)).toBe(uma);
  });
});

describe('canonicalJobUrl · fontes existentes não regridem', () => {
  it('mantém os aliases de host', () => {
    expect(
      canonicalJobUrl('https://job-boards.greenhouse.io/acme/jobs/1?gh_src=x'),
    ).toBe('https://boards.greenhouse.io/acme/jobs/1');
    expect(canonicalJobUrl('https://remoteok.io/remote-jobs/1')).toBe(
      'https://remoteok.com/remote-jobs/1',
    );
  });

  it('mantém a remoção dos sufixos de formulário', () => {
    expect(canonicalJobUrl('https://jobs.lever.co/acme/abc/apply')).toBe(
      'https://jobs.lever.co/acme/abc',
    );
    expect(
      canonicalJobUrl('https://jobs.ashbyhq.com/acme/abc/application'),
    ).toBe('https://jobs.ashbyhq.com/acme/abc');
  });

  describe('Gupy por canal', () => {
    // Tokens SINTÉTICOS com a forma real: base64 de {"jobId":…,"source":…}.
    const token = (payload: object) =>
      Buffer.from(JSON.stringify(payload)).toString('base64');

    it('a mesma vaga vinda da Gupy e da Remotar vira uma URL só', () => {
      const viaPortal = `https://acme.gupy.io/job/${token({ jobId: 1234567, source: 'gupy_portal' }).replace(/=+$/, '')}?jobBoardSource=gupy_portal`;
      const viaRemotar = `https://acme.gupy.io/job/${token({ jobId: 1234567, source: 'remotar' })}?jobBoardSource=remotar`;

      expect(canonicalJobUrl(viaPortal)).toBe(
        'https://acme.gupy.io/jobs/1234567',
      );
      expect(canonicalJobUrl(viaRemotar)).toBe(canonicalJobUrl(viaPortal));
    });

    it('vagas diferentes continuam diferentes', () => {
      expect(
        canonicalJobUrl(
          `https://acme.gupy.io/job/${token({ jobId: 1, source: 'x' })}`,
        ),
      ).not.toBe(
        canonicalJobUrl(
          `https://acme.gupy.io/job/${token({ jobId: 2, source: 'x' })}`,
        ),
      );
    });

    it('mantém o endereço clássico e o token que não decodifica', () => {
      expect(canonicalJobUrl('https://acme.gupy.io/jobs/1234567')).toBe(
        'https://acme.gupy.io/jobs/1234567',
      );
      expect(canonicalJobUrl('https://acme.gupy.io/job/naoebase64')).toBe(
        'https://acme.gupy.io/job/naoebase64',
      );
      expect(
        canonicalJobUrl(`https://acme.gupy.io/job/${token({ source: 'x' })}`),
      ).toBe(`https://acme.gupy.io/job/${token({ source: 'x' })}`);
    });

    it('só mexe em host da Gupy', () => {
      const other = `https://acme.example.com/job/${token({ jobId: 9 })}`;

      expect(canonicalJobUrl(other)).toBe(other);
    });
  });

  it('recusa o que não é http', () => {
    expect(canonicalJobUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalJobUrl('não é url')).toBeNull();
  });
});
