import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

// Server-side allow-list of accepted upload types. Note: file.mimetype (multer)
// is the client-declared Content-Type; the real backstop is that the worker
// parses the actual bytes below and fails ingestion if they don't match the type.
export const SUPPORTED_MIME = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
} as const;

export type SupportedMime = keyof typeof SUPPORTED_MIME;

export function isSupportedMime(mime: string): mime is SupportedMime {
  return mime in SUPPORTED_MIME;
}

// Extract plain text from a file buffer based on its mime type.
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    // pdf-parse v2 API: construct with the buffer, then extract text.
    const parser = new PDFParse({ data: buffer });
    const { text } = await parser.getText();
    return text;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  if (mimeType === 'text/plain') {
    return buffer.toString('utf8');
  }

  throw new Error(`Unsupported mime type: ${mimeType}`);
}
