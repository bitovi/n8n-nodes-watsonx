import type { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { DynamicStructuredTool } from 'langchain/tools';
import { z } from 'zod';
import { NodeOperationError, sleep } from 'n8n-workflow';
import type {
	IExecuteFunctions,
	INodeExecutionData,
	IDataObject,
} from 'n8n-workflow';

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
import omit from 'lodash/omit';

async function getToolsWithFormatter(
	ctx: IExecuteFunctions,
	outputParser: any,
): Promise<any[]> {
	const tools = await getTools(ctx, outputParser);

	const formatJsonTool = new DynamicStructuredTool({
		name: 'format_final_json_response',

		description:
			'Formats and sends the final answer to the user. Use this tool for your final response. ' +
			'The argument must be an object with a single key "output". e.g. {"output": "your final answer here"}',
		schema: z.object({ output: z.string() }),
		func: async ({ output }) => output,
	});

	tools.push(formatJsonTool);
	return tools;
}


export async function toolsAgentExecute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	this.logger.debug('Executing Unified Tools Agent V2');

	const returnData: INodeExecutionData[] = [];
	const items = this.getInputData();

	const outputParser = await getOptionalOutputParser(this);
	const tools = await getToolsWithFormatter(this, outputParser);

	const batchSize = this.getNodeParameter('options.batching.batchSize', 0, 1) as number;
	const delayBetweenBatches = this.getNodeParameter(
		'options.batching.delayBetweenBatches',
		0,
		0,
	) as number;
	const memory = await getOptionalMemory(this);
	const model = await getChatModel(this);

	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const batchPromises = batch.map(async (_item, batchItemIndex) => {
			const itemIndex = i + batchItemIndex;

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

			const agent = createToolCallingAgent({
				llm: model,
				tools,
				prompt,
				streamRunnable: false,
			});

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

			this.logger.debug('Invoking agent executor...');
			const rawResult = await executor.invoke(
				{
					input,
					system_message: options.systemMessage ?? SYSTEM_MESSAGE,
					// 4. ROBUSTNESS: Made the instruction more direct and imperative.
					formatting_instructions:
						'To give your final answer, you must call the `format_final_json_response` tool. Do not provide a final answer in any other way.',
				},
				{ signal: this.getExecutionCancelSignal() },
			);

			this.logger.debug('Agent invocation complete. Final output:', rawResult.output);

			const finalJson: IDataObject = { output: rawResult.output };

			const itemResult = {
				json: {
					...omit(
						rawResult,
						'system_message',
						'formatting_instructions',
						'input',
						'chat_history',
						'agent_scratchpad',
					),
					...finalJson, // Overwrite 'output' with wrapped version
				},
				pairedItem: { item: itemIndex },
			};

			return itemResult;
		});

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
				} else {
					throw new NodeOperationError(this.getNode(), error, { itemIndex });
				}
				return;
			}
			returnData.push(result.value);
		});

		if (i + batchSize < items.length && delayBetweenBatches > 0) {
			await sleep(delayBetweenBatches);
		}
	}

	return [returnData];
}
