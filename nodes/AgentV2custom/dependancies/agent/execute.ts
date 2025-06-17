import { DynamicStructuredTool } from 'langchain/tools';
import { z } from 'zod';

import type { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import omit from 'lodash/omit';
import { jsonParse, NodeOperationError, sleep } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { getPromptInputByType } from '../utils/helpers';
import { getOptionalOutputParser } from '../utils/N8nOutputParser';

import {
	fixEmptyContentMessage,
	getAgentStepsParser,
	getChatModel,
	getOptionalMemory,
	getTools,
	prepareMessages,
	preparePrompt,
} from './common';
import { SYSTEM_MESSAGE } from './prompt';

export async function toolsAgentExecute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	this.logger.debug('Executing Tools Agent V2');

	const returnData: INodeExecutionData[] = [];
	const items = this.getInputData();
	const outputParser = await getOptionalOutputParser(this);
	const tools = await getTools(this, outputParser);
	const batchSize = this.getNodeParameter('options.batching.batchSize', 0, 1) as number;
	const delayBetweenBatches = this.getNodeParameter(
		'options.batching.delayBetweenBatches',
		0,
		0,
	) as number;
	const memory = await getOptionalMemory(this);
	const model = await getChatModel(this);

	/* ----------------------------------------------------------------------
	   1. Guarantee the “format_final_json_response” tool always exists. Prevents IBM WatsonX error since ibm handling is worse
	---------------------------------------------------------------------- */
	if (!tools.some((t) => t.name === 'format_final_json_response')) {
		this.logger.debug('No formatting tool found. Injecting default formatter.');

		tools.push(
			new DynamicStructuredTool({
				name: 'format_final_json_response',
				description:
					'FINAL STEP ONLY — packages your complete answer for the user. ' +
					'Call this exactly once, when you have finished reasoning.',
				schema: z.object({
					output: z
						.any()
						.describe(
							'The final answer for the user. Can be plain text or a structured JSON object.',
						),
				}),
				/*  Must return stringified JSON so jsonParse() works later on  */
				func: async (input) => JSON.stringify(input),
			}),
		);
	}

	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const batchPromises = batch.map(async (_item, batchItemIndex) => {
			const itemIndex = i + batchItemIndex;

			/* ------------- input ↔ prompt prep ------------- */
			const input = getPromptInputByType({
				ctx: this,
				i: itemIndex,
				inputKey: 'text',
				promptTypeKey: 'promptType',
			});
			if (input === undefined) {
				throw new NodeOperationError(this.getNode(), 'The “text” parameter is empty.');
			}

			const options = this.getNodeParameter('options', itemIndex, {}) as {
				systemMessage?: string;
				maxIterations?: number;
				returnIntermediateSteps?: boolean;
				passthroughBinaryImages?: boolean;
			};

			const messages = await prepareMessages(this, itemIndex, {
				systemMessage: options.systemMessage,
				passthroughBinaryImages: options.passthroughBinaryImages ?? true,
				outputParser,
			});
			const prompt: ChatPromptTemplate = preparePrompt(messages);

			/* ------------- create agent & executor ------------- */
			const agent = createToolCallingAgent({
				llm: model,
				tools,
				prompt,
				streamRunnable: false,
			});
			agent.streamRunnable = false;

			const runnableAgent = RunnableSequence.from([
				agent,
				getAgentStepsParser(outputParser, memory),
				fixEmptyContentMessage,
			]);

			const executor = AgentExecutor.fromAgentAndTools({
				agent: runnableAgent,
				memory,
				tools,
				returnIntermediateSteps: options.returnIntermediateSteps === true,
				maxIterations: options.maxIterations ?? 10,
			});

			/* ------------- run! ------------- */
			return await executor.invoke(
				{
					input,
					system_message: options.systemMessage ?? SYSTEM_MESSAGE,
					formatting_instructions:
						'IMPORTANT: For your response to the user, you MUST call the ' +
						'`format_final_json_response` tool with your complete answer. ' +
						'Do NOT hand‑craft JSON – always use the tool, and only once.',
				},
				{ signal: this.getExecutionCancelSignal() },
			);
		});

		/* ------------------------------------------------------------------
		   3. Collect / transform results
		------------------------------------------------------------------ */
		const batchResults = await Promise.allSettled(batchPromises);

		batchResults.forEach((result, index) => {
			const itemIndex = i + index;

			if (result.status === 'rejected') {
				const error = result.reason as Error;
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error.message },
						pairedItem: { item: itemIndex },
					});
					return;
				}
				throw new NodeOperationError(this.getNode(), error);
			}

			const response = result.value;

			/*  Parse the formatter output when memory/outputParser are in play  */
			if (memory && outputParser) {
				const parsed = jsonParse<{ output: unknown }>(response.output as string);
				response.output = parsed?.output ?? parsed;
			}

			returnData.push({
				json: omit(
					response,
					'system_message',
					'formatting_instructions',
					'input',
					'chat_history',
					'agent_scratchpad',
				),
				pairedItem: { item: itemIndex },
			});
		});

		if (i + batchSize < items.length && delayBetweenBatches > 0) {
			await sleep(delayBetweenBatches);
		}
	}

	return [returnData];
}
