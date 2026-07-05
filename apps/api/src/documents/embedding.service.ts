import { Injectable, Logger } from '@nestjs/common';
import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';

interface TextChunk {
  text: string;
  tokenCount: number;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  async extractText(buffer: Buffer, docType: string, fileName: string): Promise<string> {
    try {
      switch (docType) {
        case 'pdf': {
          const data = await pdfParse(buffer);
          return data.text;
        }
        case 'docx': {
          const result = await mammoth.extractRawText({ buffer });
          return result.value;
        }
        case 'xlsx':
        case 'csv': {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          const texts: string[] = [];
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            texts.push(`Sheet: ${sheetName}\n${csv}`);
          }
          return texts.join('\n\n');
        }
        case 'txt':
        case 'md':
          return buffer.toString('utf-8');
        default:
          return buffer.toString('utf-8');
      }
    } catch (error) {
      this.logger.error(`Failed to extract text from ${fileName}`, error);
      return '';
    }
  }

  chunkText(text: string, chunkSize = 1000, overlap = 200): TextChunk[] {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];

    const words = cleaned.split(' ');
    const chunks: TextChunk[] = [];

    let i = 0;
    while (i < words.length) {
      const chunkWords = words.slice(i, i + chunkSize);
      const chunkText = chunkWords.join(' ');
      chunks.push({
        text: chunkText,
        tokenCount: Math.ceil(chunkText.length / 4),
      });
      i += chunkSize - overlap;
    }

    return chunks;
  }
}
