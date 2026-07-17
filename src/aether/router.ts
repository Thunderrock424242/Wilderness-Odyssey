import type { AetherContextBuilder } from './contextBuilder';
import type {
  AetherAgent,
  AetherAgentName,
  AetherRequest,
  AetherResponse
} from './types';

const ROUTING_RULES: Array<{ agent: AetherAgentName; pattern: RegExp }> = [
  { agent: 'lore', pattern: /\b(lore|story|archive|history|rift|anomal(?:y|ies)|cryo)\b/i },
  { agent: 'diagnostics', pattern: /\b(crash|exception|error|stacktrace|latest\.log|debug\.log|log file|mixin)\b/i },
  { agent: 'support', pattern: /\b(install|setup|launcher|curseforge|modrinth|prism|java|ram|lag|fps|support|help)\b/i },
  { agent: 'quest', pattern: /\b(quest|objective|progression|mission|advancement)\b/i },
  { agent: 'reports', pattern: /\b(report|suggestion|feedback|bug report|ticket)\b/i }
];

export class AetherRouter {
  private readonly agents = new Map<AetherAgentName, AetherAgent>();

  constructor(
    agents: AetherAgent[],
    private readonly contextBuilder: AetherContextBuilder
  ) {
    for (const agent of agents) {
      this.agents.set(agent.name, agent);
    }
  }

  selectAgent(request: AetherRequest): AetherAgentName {
    if (request.agentHint && this.agents.has(request.agentHint)) {
      return request.agentHint;
    }

    if (request.attachments.length > 0) {
      return 'diagnostics';
    }

    return ROUTING_RULES.find((rule) => rule.pattern.test(request.message))?.agent ?? 'general';
  }

  async route(request: AetherRequest): Promise<AetherResponse> {
    const selectedName = this.selectAgent(request);
    const selectedAgent = this.agents.get(selectedName);
    if (!selectedAgent || !selectedAgent.isAvailable()) {
      return {
        requestId: request.requestId,
        agentName: selectedName,
        responseText: 'The selected Aether module is unavailable right now. Existing bot commands are still available.',
        status: 'error',
        confidence: 'low'
      };
    }

    try {
      return await selectedAgent.handle(request, this.contextBuilder.build(request));
    } catch {
      return {
        requestId: request.requestId,
        agentName: selectedName,
        responseText: 'That Aether module could not complete the request. Try again or use the existing dedicated bot command for this workflow.',
        status: 'error',
        confidence: 'low'
      };
    }
  }

  getAgentStatuses(): Array<{ name: AetherAgentName; available: boolean }> {
    return [...this.agents.values()].map((agent) => ({
      name: agent.name,
      available: agent.isAvailable()
    }));
  }
}
