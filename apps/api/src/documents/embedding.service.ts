import { Injectable, Logger } from '@nestjs/common';
import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { OfficeParser } from 'officeparser';

interface TextChunk {
  text: string;
  tokenCount: number;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  async extractText(buffer: Buffer, docType: string, fileName: string): Promise<string> {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error(`Cannot extract text from an empty file: ${fileName}`);
    }

    try {
      let extractedText: string;
      switch (docType) {
        case 'pdf': {
          const data = await pdfParse(buffer);
          extractedText = data.text;
          break;
        }
        case 'docx': {
          const result = await mammoth.extractRawText({ buffer });
          extractedText = result.value;
          break;
        }
        case 'pptx': {
          const ast = await OfficeParser.parseOffice(buffer, { fileType: 'pptx' });
          const result = await ast.to('text', {
            includeImages: false,
            textConfig: { preserveLayout: false, renderNotes: true },
          });
          extractedText = result.value;
          break;
        }
        case 'xlsx':
        case 'csv': {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          const texts: string[] = [];
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            if (csv.trim()) texts.push(`Sheet: ${sheetName}\n${csv}`);
          }
          extractedText = texts.join('\n\n');
          break;
        }
        case 'txt':
        case 'md':
          extractedText = buffer.toString('utf-8');
          break;
        default:
          throw new Error(`Unsupported document extraction type: ${docType}`);
      }

      if (!extractedText || !extractedText.trim()) {
        throw new Error(`No readable text was extracted from ${fileName}.`);
      }
      return extractedText;
    } catch (error) {
      this.logger.error(
        `Failed to extract text from ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  chunkText(text: string, chunkSize = 1000, overlap = 200): TextChunk[] {
    if (!Number.isInteger(chunkSize) || chunkSize < 1) {
      throw new Error('Chunk size must be a positive integer.');
    }
    if (!Number.isInteger(overlap) || overlap < 0 || overlap >= chunkSize) {
      throw new Error('Chunk overlap must be a non-negative integer smaller than chunk size.');
    }

    const cleaned = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];

    const words = cleaned.split(' ');
    const chunks: TextChunk[] = [];
    let index = 0;

    while (index < words.length) {
      const chunkWords = words.slice(index, index + chunkSize);
      const chunkText = chunkWords.join(' ');
      chunks.push({
        text: chunkText,
        tokenCount: Math.ceil(chunkText.length / 4),
      });
      index += chunkSize - overlap;
    }

    return chunks;
  }
}