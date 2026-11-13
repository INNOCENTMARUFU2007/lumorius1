import { Module } from '@nestjs/common';
import { ExecutivePdfService } from './executive-pdf.service';

@Module({
  providers: [ExecutivePdfService],
  exports: [ExecutivePdfService],
})
export class ExecutivePdfModule {}
