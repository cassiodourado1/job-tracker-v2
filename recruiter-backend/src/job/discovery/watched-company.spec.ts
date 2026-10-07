import { jobPreferencesSchema, watchedCompanyFromUrl } from '@recruit/shared';

describe('watchedCompanyFromUrl', () => {
  it.each([
    ['https://acme.gupy.io/', 'gupy', 'acme'],
    ['https://acme.gupy.io/jobs/123?jobBoardSource=x', 'gupy', 'acme'],
    ['https://acme.inhire.app/vagas', 'inhire', 'acme'],
    ['https://boards.greenhouse.io/acme', 'greenhouse', 'acme'],
    ['https://job-boards.greenhouse.io/acme/jobs/1', 'greenhouse', 'acme'],
    ['https://jobs.lever.co/acme', 'lever', 'acme'],
    ['https://jobs.ashbyhq.com/acme/abc', 'ashby', 'acme'],
    ['https://ciandt.com/br/pt-br/carreiras', 'lever', 'ciandt'],
    ['https://www.squadra.com.br/vagas/', 'squadra', 'squadra'],
  ])('%s → %s', (url, platform, slug) => {
    expect(watchedCompanyFromUrl(url)).toEqual({ platform, slug });
  });

  it.each([
    ['https://portal.gupy.io/job-search/term=front'],
    ['https://www.gupy.io/'],
    ['https://api.inhire.app/job-posts'],
    ['https://boards.greenhouse.io/'],
    ['https://www.empresa-qualquer.com.br/carreiras'],
    ['não é endereço'],
    ['javascript:alert(1)'],
  ])('não reconhece %s', (url) => {
    expect(watchedCompanyFromUrl(url)).toBeNull();
  });
});

describe('jobPreferencesSchema.companyPages', () => {
  it('preferência gravada antes do campo começa sem empresas', () => {
    expect(
      jobPreferencesSchema.parse({
        scope: null,
        workModels: [],
        contractTypes: [],
        seniorities: [],
        stacks: [],
        titleIncludes: [],
        titleExcludes: [],
      }).companyPages,
    ).toEqual([]);
  });
});
