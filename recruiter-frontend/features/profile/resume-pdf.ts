import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import { MAX_RESUME_TEXT, MIN_RESUME_TEXT } from "@recruit/shared";

/** Currículo em PDF raramente passa de 1 MB; 5 MB cobre os com foto. */
export const MAX_PDF_BYTES = 5 * 1024 * 1024;

export class PdfImportError extends Error {}

/**
 * O texto de um PDF de currículo, lido aqui no servidor do Next e descartado.
 *
 * Só o TEXTO segue para a API, nunca o arquivo: é bem menor, e o que a API
 * repassa ao modelo passa antes pela remoção de dados pessoais. PDF que é
 * imagem escaneada não tem texto, e isso vira uma mensagem que diz o porquê.
 */
export async function extractResumePdfText(file: File): Promise<string> {
  if (file.size > MAX_PDF_BYTES) {
    throw new PdfImportError("O PDF passa de 5 MB. Exporte uma versão menor.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // A assinatura "%PDF" no começo, e não a extensão nem o tipo informado pelo
  // navegador: os dois vêm do usuário.
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new PdfImportError("Esse arquivo não é um PDF.");
  }

  let text: string;

  try {
    const pdf = await getDocumentProxy(bytes);
    text = (await extractText(pdf, { mergePages: true })).text;
  } catch {
    throw new PdfImportError(
      "Não consegui ler esse PDF. Ele pode estar protegido ou corrompido.",
    );
  }

  const clean = text.replace(/[ \t]+\n/g, "\n").trim();

  if (clean.length < MIN_RESUME_TEXT) {
    throw new PdfImportError(
      "O PDF quase não tem texto — parece imagem escaneada. Use um PDF exportado do editor (Word, Google Docs, Canva).",
    );
  }

  return clean.slice(0, MAX_RESUME_TEXT);
}
