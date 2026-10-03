interface TextChunk {
    text: string;
    tokenCount: number;
}
export declare class EmbeddingService {
    private readonly logger;
    extractText(buffer: Buffer, docType: string, fileName: string): Promise<string>;
    chunkText(text: string, chunkSize?: number, overlap?: number): TextChunk[];
}
export {};
//# sourceMappingURL=embedding.service.d.ts.map