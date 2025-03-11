/**
 * Agent Interface
 *
 * Changes:
 * - Created the base interfaces for the agent architecture
 * - Defined AgentInput, AgentOutput, and Agent interfaces
 * - These interfaces will be implemented by all agent services
 */

// We'll need to create this interface or import it from the OpenAI module
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AgentInput {
  query: string;
  conversationHistory: ChatMessage[];
  additionalContext?: Record<string, any>;
}

export interface AgentOutput {
  response: string;
  data?: Record<string, any>;
  requiredInputs?: string[];
  missingInputs?: string[];
}

export interface Agent {
  name: string;
  description: string;
  requiredInputs: string[];
  canHandle(input: AgentInput): Promise<boolean>;
  process(input: AgentInput): Promise<AgentOutput>;
}
