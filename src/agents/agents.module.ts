/**
 * Agents Module
 *
 * Changes:
 * - Created the main agents module
 * - Imported all agent modules
 * - Implemented OnModuleInit to register all agents with the orchestrator
 * - Added forwardRef() to break circular dependency with OpenAiModule
 * - Fixed agent registration by directly injecting agent services
 * - Added ResponseAgentModule and ResponseAgentService
 * - Added ValidatorAgentModule and ValidatorAgentService
 */
import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AgentOrchestratorModule } from './orchestrator/agent-orchestrator.module';
import { FilterAgentModule } from './filter-agent/filter-agent.module';
import { MapsAgentModule } from './maps-agent/maps-agent.module';
import { PropertyAgentModule } from './property-agent/property-agent.module';
import { ResponseAgentModule } from './response-agent/response-agent.module';
import { ValidatorAgentModule } from './validator-agent/validator-agent.module';
import { AgentOrchestratorService } from './orchestrator/agent-orchestrator.service';
import { FilterAgentService } from './filter-agent/filter-agent.service';
import { MapsAgentService } from './maps-agent/maps-agent.service';
import { PropertyAgentService } from './property-agent/property-agent.service';
import { ResponseAgentService } from './response-agent/response-agent.service';
import { ValidatorAgentService } from './validator-agent/validator-agent.service';

@Module({
  imports: [
    forwardRef(() => AgentOrchestratorModule),
    FilterAgentModule,
    MapsAgentModule,
    PropertyAgentModule,
    ResponseAgentModule,
    ValidatorAgentModule,
  ],
  exports: [AgentOrchestratorModule],
})
export class AgentsModule implements OnModuleInit {
  constructor(
    private readonly agentOrchestratorService: AgentOrchestratorService,
    private readonly filterAgentService: FilterAgentService,
    private readonly mapsAgentService: MapsAgentService,
    private readonly propertyAgentService: PropertyAgentService,
    private readonly responseAgentService: ResponseAgentService,
    private readonly validatorAgentService: ValidatorAgentService,
  ) {}

  onModuleInit() {
    // Register all agents with the orchestrator
    this.agentOrchestratorService.registerAgent(this.validatorAgentService); // Register first to validate inputs
    this.agentOrchestratorService.registerAgent(this.filterAgentService);
    this.agentOrchestratorService.registerAgent(this.mapsAgentService);
    this.agentOrchestratorService.registerAgent(this.propertyAgentService);
    this.agentOrchestratorService.registerAgent(this.responseAgentService);
  }
}
