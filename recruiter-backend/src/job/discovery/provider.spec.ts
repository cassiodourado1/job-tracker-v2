import { DEFAULT_SEARCH_TERMS } from '@recruit/shared';
import { searchTermsFor } from './provider';

describe('searchTermsFor', () => {
  it('o texto digitado vence os termos do perfil', () => {
    expect(searchTermsFor({ q: ' clojure ', terms: ['front-end'] })).toEqual([
      'clojure',
    ]);
  });

  it('sem texto, usa os termos do perfil', () => {
    expect(searchTermsFor({ q: '  ', terms: ['front-end', 'vue'] })).toEqual([
      'front-end',
      'vue',
    ]);
  });

  it('sem texto e sem termos, cai no padrão em vez de buscar o acervo inteiro', () => {
    expect(searchTermsFor({})).toEqual(DEFAULT_SEARCH_TERMS);
    expect(searchTermsFor({ terms: ['  '] })).toEqual(DEFAULT_SEARCH_TERMS);
  });
});
