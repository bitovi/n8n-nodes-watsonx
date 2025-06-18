import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { Langfuse } from 'langfuse';
import type { LangfuseTraceClient, LangfuseSpanClient } from 'langfuse';
import type { AgentAction, AgentFinish } from '@langchain/core/agents';
import type { LLMResult } from '@langchain/core/outputs';
import type { Serialized } from '@langchain/core/load/serializable';
import type { IDataObject } from 'n8n-workflow';

import { slugifyWorkflowName, langfuseEnd } from './N8nLangfuseHelpers';

const LOG_NAME = 'WatsonX-Langfuse-Agent';

type LangfuseAgentConfig = {
	publicKey: string | undefined;
	secretKey: string | undefined;
	baseUrl: string | undefined;
	metadata: LangfuseAgentMetadata;
	logger: any;
};

type LangfuseAgentMetadata = {
	modelName: string;
	workflowName: string;
};

export class N8nLangfuseAgentHandler extends BaseCallbackHandler {
	name: string;
	langfuse: Langfuse;
	metadata: LangfuseAgentMetadata;
	logger: any;
	input: any;
	llmName: string | null;
	//Langfuse specific variables
	trace: LangfuseTraceClient | null;
	agentSpan: LangfuseSpanClient | null;
	llmSpan: LangfuseSpanClient | null;
	toolSpan: LangfuseSpanClient | null;

	constructor(config: LangfuseAgentConfig) {
		super();
		this.name = 'N8nLangfuseAgentHandler';
		this.langfuse = new Langfuse({
			publicKey: config.publicKey,
			secretKey: config.secretKey,
			baseUrl: config.baseUrl,
		});
		this.metadata = config.metadata;
		this.logger = config.logger;
		this.input = null;
		this.llmName = null;
		this.trace = null;
		this.agentSpan = null;
		this.llmSpan = null;
		this.toolSpan = null;
	}
	// Agent
	async handleAgentAction(action: AgentAction): Promise<void> {
		const workflowSlug = slugifyWorkflowName(this.metadata.workflowName);
		this.logger.debug(`[${LOG_NAME}] Creating AI Agent trace...`);
		this.trace = this.langfuse.trace({
			name: `trace-ai-agent-${workflowSlug}`,
			userId: 'n8n-watsonx-ai-agent-test',
		});

		this.logger.debug(`[${LOG_NAME}] Creating AI Agent span...`);
		this.agentSpan = this.trace.span({ name: `span-ai-agent-${workflowSlug}` });

		this.logger.debug(`[${LOG_NAME}] Updating trace and AI Agent span with input and metadata...`);
		await this.trace?.update({
			input: action,
			metadata: { step: 'started', startTime: Date.now(), ...this.metadata },
		});

		this.agentSpan = this.langfuse.span({
			input: action,
			metadata: {
				step: 'agent_start',
				startAgentTime: Date.now(),
				...this.metadata,
			},
		});
	}

	async handleAgentEnd?(action: AgentFinish): Promise<void> {
		const endTime = Date.now();

		this.logger.debug(`[${LOG_NAME}] Updating trace and LLM span with output and metadata...`);
		await this.trace?.update({
			output: action.returnValues,
			metadata: {
				step: 'completed',
				endTime,
				...this.metadata,
			},
		});

		await this.agentSpan?.update({
			output: action,
			metadata: {
				step: 'agent_completed',
				endTime,
				...this.metadata,
			},
		});

		await langfuseEnd(this.logger, LOG_NAME, this.langfuse, [
			this.agentSpan as LangfuseSpanClient,
			this.llmSpan as LangfuseSpanClient,
			this.toolSpan as LangfuseSpanClient,
		]);
	}

	// LLM
	async handleLLMStart(llm: Serialized, prompts: string[]) {
		this.llmName = llm.name || 'watson-x'; //this.metadata.modelName
		const raw = Array.isArray(prompts) ? prompts[0] : prompts;
		this.input =
			typeof raw === 'string' ? raw.replace(/^Human:\s*/, '') : (raw as any)?.text || String(raw);

		this.logger.debug(`[${LOG_NAME}] Creating LLM span...`);
		this.llmSpan = (this.trace as LangfuseTraceClient).span({ name: `span-llm-${llm.name}` });

		this.logger.debug(`[${LOG_NAME}] Updating LLM span with input and metadata...`);
		await this.llmSpan.update({
			input: this.input,
			metadata: { step: 'started', startLlmTime: Date.now(), ...this.metadata },
		});
	}

	async handleLLMEnd(output: LLMResult) {
		// Parse output
		let text = '[missing output]';
		if (output?.generations) {
			const gens = output.generations;
			text = Array.isArray(gens[0]) ? gens[0][0]?.text : (gens[0] as any)?.text;
		}

		// Extract usage tokens
		let promptTokens = 0,
			completionTokens = 0,
			totalTokens = 0;
		try {
			const gens = output.generations;
			const msg = Array.isArray(gens[0]) ? (gens[0][0] as any).message : (gens[0] as any).message;
			const usage = msg.kwargs?.usage_metadata || {};
			promptTokens = usage.input_tokens || 0;
			completionTokens = usage.output_tokens || 0;
			totalTokens = usage.total_tokens || promptTokens + completionTokens;
		} catch {}

		this.logger.debug(`[${LOG_NAME}] Updating LLM span with output and metadata...`);
		await this.llmSpan?.update({
			output: text,
			metadata: {
				step: 'llm_completed',
				endLlmTime: Date.now(),
				promptTokens,
				completionTokens,
				totalTokens,
				...this.metadata,
			},
		});
	}

	async handleLLMError(error: IDataObject | Error) {
		// Filter out non-x- headers to avoid leaking sensitive information in logs
		if (typeof error === 'object' && error?.hasOwnProperty('headers')) {
			const errorWithHeaders = error as { headers: Record<string, unknown> };

			Object.keys(errorWithHeaders.headers).forEach((key) => {
				if (!key.startsWith('x-')) {
					delete errorWithHeaders.headers[key];
				}
			});
		}
		const endTime = Date.now();

		this.logger.debug(`[${LOG_NAME}] Updating trace and LLM span with LLM error...`);
		await this.trace?.update({
			output: `[${LOG_NAME}] LLM Error: ${error.message}`,
			metadata: {
				step: 'error',
				endTime,
				...this.metadata,
			},
		});

		await this.llmSpan?.update({
			output: `[${LOG_NAME}] Error: ${error.message}`,
			metadata: {
				step: 'llm_error',
				endLlmTime: endTime,
				...this.metadata,
			},
		});

		await langfuseEnd(this.logger, LOG_NAME, this.langfuse, [
			this.agentSpan as LangfuseSpanClient,
			this.llmSpan as LangfuseSpanClient,
		]);
	}

	// Tools
	async handleToolStart(
		tool: Serialized,
		input: string,
		runId: string,
		parentRunId?: string | undefined,
		tags?: string[] | undefined,
		metadata?: Record<string, unknown> | undefined,
		name?: string,
	): Promise<void> {
		this.logger.debug(`[${LOG_NAME}] Tool ${name} start, creating Tool span...`);
		this.toolSpan = (this.trace as LangfuseTraceClient).span({
			id: runId,
			name: `span-tool-${tool.name}`,
			input: input,
			metadata: {
				step: 'tool_start',
				toolType: tool.type,
				toolMetadata: metadata,
				toolStartTime: Date.now(),
				...this.metadata,
			},
		});
	}

	async handleToolEnd(output: string): Promise<void> {
		this.logger.debug(`[${LOG_NAME}] Updating Tool span...`);
		await this.toolSpan?.update({
			output: output,
			metadata: {
				step: 'tool_completed',
				toolEndTime: Date.now(),
				...this.metadata,
			},
		});
	}

	async handleToolError(err: any): Promise<void> {
		// Filter out non-x- headers to avoid leaking sensitive information in logs
		if (typeof err === 'object' && err?.hasOwnProperty('headers')) {
			const errorWithHeaders = err as { headers: Record<string, unknown> };

			Object.keys(errorWithHeaders.headers).forEach((key) => {
				if (!key.startsWith('x-')) {
					delete errorWithHeaders.headers[key];
				}
			});
		}

		const endTime = Date.now();

		this.logger.debug(`[${LOG_NAME}] Updating trace and Tool span with Tool error...`);
		await this.trace?.update({
			output: `[${LOG_NAME}] Tool Error: ${err.message}`,
			metadata: {
				step: 'error',
				endTime,
				...this.metadata,
			},
		});

		await this.toolSpan?.update({
			output: `[${LOG_NAME}] Error: ${err.message}`,
			metadata: {
				step: 'tool_error',
				toolEndTime: endTime,
				...this.metadata,
			},
		});

		await langfuseEnd(this.logger, LOG_NAME, this.langfuse, [
			this.agentSpan as LangfuseSpanClient,
			this.llmSpan as LangfuseSpanClient,
			this.toolSpan as LangfuseSpanClient,
		]);
	}
}
