import {
  DEFAULT_SEARCH_TERMS,
  jobPreferencesSchema,
  MAX_SEARCH_TERMS,
} from '@recruit/shared';

/**
 * Preferências ficam gravadas no perfil como JSON. Campo novo no schema não
 * pode invalidar o que já estava salvo: o `JobService` cairia no padrão e o
 * usuário perderia o filtro sem aviso.
 */
describe('jobPreferencesSchema.searchTerms', () => {
  const salvaAntes = {
    scope: 'brasil',
    workModels: ['remoto'],
    contractTypes: [],
    seniorities: ['senior'],
    stacks: ['Vue'],
    titleIncludes: ['front-end'],
    titleExcludes: [],
    linkedinMaxAgeDays: 14,
  };

  it('preferência gravada antes do campo recebe os termos padrão', () => {
    const parsed = jobPreferencesSchema.parse(salvaAntes);

    expect(parsed.searchTerms).toEqual(DEFAULT_SEARCH_TERMS);
    expect(parsed.workModels).toEqual(['remoto']);
  });

  it('aceita termos próprios, limpando espaços', () => {
    const parsed = jobPreferencesSchema.parse({
      ...salvaAntes,
      searchTerms: ['  front-end ', 'vue'],
    });

    expect(parsed.searchTerms).toEqual(['front-end', 'vue']);
  });

  it('recusa lista vazia e lista acima do teto', () => {
    expect(
      jobPreferencesSchema.safeParse({ ...salvaAntes, searchTerms: [] })
        .success,
    ).toBe(false);
    expect(
      jobPreferencesSchema.safeParse({
        ...salvaAntes,
        searchTerms: Array.from(
          { length: MAX_SEARCH_TERMS + 1 },
          (_, i) => `t${i}`,
        ),
      }).success,
    ).toBe(false);
  });
});
