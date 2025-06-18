import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { Langfuse } from 'langfuse';
import type { LangfuseTraceClient, LangfuseSpanClient } from 'langfuse';
import type { LLMResult } from '@langchain/core/outputs';
import type { Serialized } from '@langchain/core/load/serializable';
import type { IDataObject } from 'n8n-workflow';

import { slugifyWorkflowName, langfuseEnd } from './N8nLangfuseHelpers';

type LangfuseConfig = {
	publicKey: string | undefined;
	secretKey: string | undefined;
	baseUrl: string | undefined;
	metadata: LangfuseMetadata;
	logger: any;
};

type LangfuseMetadata = {
	modelName: string;
	workflowName: string;
};

export class N8nLangfuseHandler extends BaseCallbackHandler {
	name: string;
	langfuse: Langfuse;
	metadata: LangfuseMetadata;
	logger: any;
	input: any;
	startTime: number | null;
	endTime: number | null;
	llmName: string | null;
	//Langfuse specific variables
	trace: LangfuseTraceClient | null;
	llmSpan: LangfuseSpanClient | null;
	toolSpan: LangfuseSpanClient | null;

	constructor(config: LangfuseConfig) {
		super();
		this.name = 'N8nLangfuseHandler';
		this.langfuse = new Langfuse({
			publicKey: config.publicKey,
			secretKey: config.secretKey,
			baseUrl: config.baseUrl,
		});
		this.metadata = config.metadata;
		this.logger = config.logger;
		this.input = null;
		this.startTime = null;
		this.endTime = null;
		this.llmName = null;
		this.trace = null;
		this.llmSpan = null;
		this.toolSpan = null;
	}

	// LLM
	async handleLLMStart(llm: Serialized, prompts: string[]) {
		this.startTime = Date.now();
		this.llmName = llm.name || 'watson-x'; //this.metadata.modelName
		const raw = Array.isArray(prompts) ? prompts[0] : prompts;
		this.input =
			typeof raw === 'string' ? raw.replace(/^Human:\s*/, '') : (raw as any)?.text || String(raw);

		const workflowSlug = slugifyWorkflowName(this.metadata.workflowName);
		this.logger.debug('[WatsonX-Langfuse] Creating trace...');
		this.trace = this.langfuse.trace({
			name: `trace-test-${workflowSlug}`,
			userId: 'n8n-watsonx-llmx-test',
		});
		this.logger.debug('[WatsonX-Langfuse] Creating LLM span...');
		this.llmSpan = this.trace.span({ name: `span-llm-${workflowSlug}` });

		this.logger.debug('[WatsonX-Langfuse] Updating trace and LLM span with input and metadata...');
		await this.trace.update({
			input: this.input,
			metadata: { step: 'started', startTime: this.startTime, ...this.metadata },
		});
		await this.llmSpan.update({
			input: this.input,
			metadata: { step: 'started', startTime: this.startTime, ...this.metadata },
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

		//custom time metric
		this.endTime = Date.now();

		this.logger.debug('[WatsonX-Langfuse] Updating trace and LLM span with output and metadata...');
		await this.trace?.update({
			output: text,
			metadata: {
				step: 'completed',
				endTime: this.endTime,
				promptTokens,
				completionTokens,
				totalTokens,
				...this.metadata,
			},
		});

		await this.llmSpan?.update({
			output: text,
			metadata: {
				step: 'completed',
				endTime: this.endTime,
				promptTokens,
				completionTokens,
				totalTokens,
				...this.metadata,
			},
		});

		await langfuseEnd(this.logger, this.langfuse, [this.llmSpan as LangfuseSpanClient]);
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

		//custom time metric
		this.endTime = Date.now();
		//const modelRunTime = this.startTime ? this.endTime - this.startTime : 0;

		this.logger.debug('[WatsonX-Langfuse] Updating trace and LLM span with LLM error...');
		await this.trace?.update({
			output: `[WatsonX-Langfuse] Error: ${error.message}`,
			metadata: {
				step: 'error',
				endTime: this.endTime,
				...this.metadata,
			},
		});

		await this.llmSpan?.update({
			output: `[WatsonX-Langfuse] Error: ${error.message}`,
			metadata: {
				step: 'error',
				endTime: this.endTime,
				...this.metadata,
			},
		});

		await langfuseEnd(this.logger, this.langfuse, [this.llmSpan as LangfuseSpanClient]);
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
		this.logger.debug(`[WatsonX-Langfuse] Tool ${name} start, creating Tool span...`);
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
		this.logger.debug(`[WatsonX-Langfuse] Updating Tool span...`);
		await this.toolSpan?.update({
			output: output,
			metadata: {
				step: 'tool_completed',
				toolEndTime: Date.now(),
				...this.metadata,
			},
		});
		await this.toolSpan?.end();
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

		this.logger.debug('[WatsonX-Langfuse] Updating Tool span with Tool error...');
		await this.toolSpan?.update({
			output: `[WatsonX-Langfuse] Tool Error: ${err.message}`,
			metadata: {
				step: 'tool_error',
				toolEndTime: Date.now(),
				...this.metadata,
			},
		});
		await langfuseEnd(this.logger, this.langfuse, [
			this.llmSpan as LangfuseSpanClient,
			this.toolSpan as LangfuseSpanClient,
		]);
	}
}
