import { analyzeCrashLog, redactLog } from '../../services/logParser';
import type { AetherAgent, AetherContext, AetherRequest, AetherResponse } from '../types';

export class DiagnosticsAgent implements AetherAgent {
  readonly name = 'diagnostics' as const;

  isAvailable(): boolean {
    return true;
  }

  async handle(request: AetherRequest, _context: AetherContext): Promise<AetherResponse> {
    const content = request.attachments
      .map((attachment) => attachment.content ?? '')
      .filter(Boolean)
      .join('\n');
    const diagnosticText = content || request.message;
    if (!diagnosticText.trim()) {
      return {
        requestId: request.requestId,
        agentName: this.name,
        responseText: 'No diagnostic text was provided. Attach a supported text log or include the exact error message.',
        status: 'limited',
        confidence: 'low'
      };
    }

    const analysis = analyzeCrashLog(redactLog(diagnosticText));
    const responseText = [
      `**Likely cause:** ${analysis.likelyCause}`,
      `**Confidence:** ${analysis.confidence} (${Math.round(analysis.confidenceScore * 100)}%)`,
      `**Signals:**\n${analysis.signals.map((signal) => `- ${signal}`).join('\n')}`,
      `**Recommended next steps:**\n${analysis.nextSteps.map((step) => `- ${step}`).join('\n')}`,
      '**Data handling:** The attachment was treated as text, redacted in memory, and was not executed.'
    ].join('\n\n');

    return {
      requestId: request.requestId,
      agentName: this.name,
      responseText: responseText.slice(0, 3800),
      status: 'ok',
      confidence: analysis.confidence,
      metadata: {
        likelyCause: analysis.likelyCause,
        attachmentCount: request.attachments.length
      }
    };
  }
}
