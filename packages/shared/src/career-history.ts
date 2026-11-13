import { z } from 'zod';

/**
 * Histórico profissional: a trajetória inteira, de onde o currículo é um
 * recorte.
 *
 * Existe porque o currículo base não cabe tudo — quem trabalhou com Drupal,
 * React e PHP escolhe o que mostrar, e o currículo adaptado só podia reordenar
 * esse recorte. Com o histórico, o modelo pode trazer o fato que a vaga pede e
 * ficou de fora, e o servidor continua conferindo, sem IA, que cada afirmação
 * cita um trecho literal do currículo OU daqui (§4).
 *
 * Vai inteiro ao Claude, então é só a parte profissional (§7): nada de
 * contato, documento ou dado de saúde. A tela diz isso ao lado do campo.
 */

/** Teto pelo custo: o histórico vai em toda chamada que usa o currículo. */
export const CAREER_NOTES_MAX = 12000;
export const CAREER_EXCLUDE_MAX = 30;

export const careerHistorySchema = z.object({
  notes: z.string().trim().max(CAREER_NOTES_MAX).nullable(),
  /**
   * O que é verdade mas não deve ir para a empresa: um emprego curto, uma
   * tecnologia que você não quer mais usar. O servidor procura cada item no
   * texto gerado e aponta na revisão — não depende de o modelo obedecer.
   */
  exclude: z
    .array(z.string().trim().min(2).max(120))
    .max(CAREER_EXCLUDE_MAX),
});

export type CareerHistory = z.infer<typeof careerHistorySchema>;

export const emptyCareerHistory: CareerHistory = { notes: null, exclude: [] };
