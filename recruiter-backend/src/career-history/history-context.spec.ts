import { historySystemBlocks, historyText } from './history-context';

describe('historySystemBlocks', () => {
  it('sem histórico, não acrescenta bloco: a chamada fica como era', () => {
    expect(historySystemBlocks({ notes: null, exclude: [] })).toEqual([]);
  });

  it('com histórico, um bloco com marcador de cache próprio', () => {
    expect(
      historySystemBlocks({ notes: 'Fato sintético.', exclude: ['Java'] }),
    ).toEqual([
      {
        type: 'text',
        text: '<historico>\nFato sintético.\n</historico>\n\n<nao_incluir>\n- Java\n</nao_incluir>',
        cache_control: { type: 'ephemeral' },
      },
    ]);
  });
});

describe('historyText', () => {
  it('é só o texto das notas: a lista "não incluir" não serve de prova', () => {
    expect(historyText({ notes: 'Fato.', exclude: ['Java'] })).toBe('Fato.');
    expect(historyText({ notes: null, exclude: ['Java'] })).toBe('');
  });
});
