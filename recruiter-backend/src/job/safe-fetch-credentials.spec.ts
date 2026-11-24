import { fetchPublicJson } from './safe-fetch';

// DNS falso: os domínios do teste resolvem para um IP público de documentação
// fora das faixas bloqueadas, sem rede de verdade.
jest.mock('node:dns', () => ({
  promises: {
    lookup: jest.fn(() =>
      Promise.resolve([{ address: '93.184.216.34', family: 4 }]),
    ),
  },
}));

/** Token SINTÉTICO. */
const AUTH = { Authorization: 'Bearer token-sintetico' };

function respond(status: number, headers: Record<string, string>, body = '') {
  return new Response(status >= 300 && status < 400 ? null : body, {
    status,
    headers,
  });
}

describe('credencial em redirecionamento', () => {
  const fetchMock = jest.fn<Promise<Response>, [unknown, RequestInit]>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('não leva o token para outro domínio', async () => {
    fetchMock
      .mockResolvedValueOnce(
        respond(302, { location: 'https://outro.example.com/vagas' }),
      )
      .mockResolvedValueOnce(
        respond(200, { 'content-type': 'application/json' }, '{"ok":true}'),
      );

    await fetchPublicJson('https://api.example.com/vagas', AUTH);

    const sent = fetchMock.mock.calls.map(
      ([, init]: [unknown, RequestInit]) =>
        (init.headers as Record<string, string>).Authorization,
    );
    expect(sent).toEqual(['Bearer token-sintetico', undefined]);
  });

  it('mantém o token no mesmo domínio', async () => {
    fetchMock
      .mockResolvedValueOnce(respond(301, { location: '/v2/vagas' }))
      .mockResolvedValueOnce(
        respond(200, { 'content-type': 'application/json' }, '{"ok":true}'),
      );

    await fetchPublicJson('https://api.example.com/vagas', AUTH);

    const second = fetchMock.mock.calls[1][1];
    expect((second.headers as Record<string, string>).Authorization).toBe(
      'Bearer token-sintetico',
    );
  });
});
