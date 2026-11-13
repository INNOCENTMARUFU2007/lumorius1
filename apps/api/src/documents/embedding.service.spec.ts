import { OfficeParser } from 'officeparser';
import { EmbeddingService } from './embedding.service';

jest.mock('officeparser', () => ({
  OfficeParser: { parseOffice: jest.fn() },
}));

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  const parseOfficeMock = OfficeParser.parseOffice as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmbeddingService();
  });

  it('extracts text and speaker notes from PowerPoint presentations', async () => {
    const buffer = Buffer.from('pptx-package');
    const to = jest.fn().mockResolvedValue({ value: 'Quarterly strategy\nSlide notes' });
    parseOfficeMock.mockResolvedValue({ to });

    const result = await service.extractText(buffer, 'pptx', 'quarterly-strategy.pptx');

    expect(parseOfficeMock).toHaveBeenCalledWith(buffer, { fileType: 'pptx' });
    expect(to).toHaveBeenCalledWith('text', {
      includeImages: false,
      textConfig: { preserveLayout: false, renderNotes: true },
    });
    expect(result).toContain('Quarterly strategy');
    expect(result).toContain('Slide notes');
  });
});