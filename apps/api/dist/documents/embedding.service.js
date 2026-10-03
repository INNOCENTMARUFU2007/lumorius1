"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var EmbeddingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = void 0;
const common_1 = require("@nestjs/common");
const pdfParse = __importStar(require("pdf-parse"));
const mammoth = __importStar(require("mammoth"));
const XLSX = __importStar(require("xlsx"));
let EmbeddingService = EmbeddingService_1 = class EmbeddingService {
    constructor() {
        this.logger = new common_1.Logger(EmbeddingService_1.name);
    }
    async extractText(buffer, docType, fileName) {
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
                    const texts = [];
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
        }
        catch (error) {
            this.logger.error(`Failed to extract text from ${fileName}`, error);
            return '';
        }
    }
    chunkText(text, chunkSize = 1000, overlap = 200) {
        const cleaned = text.replace(/\s+/g, ' ').trim();
        if (!cleaned)
            return [];
        const words = cleaned.split(' ');
        const chunks = [];
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
};
exports.EmbeddingService = EmbeddingService;
exports.EmbeddingService = EmbeddingService = EmbeddingService_1 = __decorate([
    (0, common_1.Injectable)()
], EmbeddingService);
//# sourceMappingURL=embedding.service.js.map