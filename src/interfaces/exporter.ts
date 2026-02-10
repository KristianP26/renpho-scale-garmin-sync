import type { BodyComposition } from './scale-adapter.js';

export interface ExportResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface Exporter {
  readonly name: string;
  export(data: BodyComposition): Promise<ExportResult>;
  healthcheck?(): Promise<ExportResult>;
}
