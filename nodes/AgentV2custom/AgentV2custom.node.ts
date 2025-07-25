import { NodeConnectionTypes, VersionedNodeType } from 'n8n-workflow';
import type {
	INodeInputConfiguration,
	INodeInputFilter,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	INodeTypeBaseDescription,
	IVersionedNodeType,
} from 'n8n-workflow';

import {
	promptTypeOptions,
	textFromPreviousNode,
	textInput,
} from './dependencies/utils/descriptions';

import { toolsAgentProperties } from './dependencies/agent/description';
import { toolsAgentExecute } from './dependencies/agent/execute';

function getInputs(hasOutputParser?: boolean): Array<NodeConnectionType | INodeInputConfiguration> {
	interface SpecialInput {
		type: NodeConnectionType;
		filter?: INodeInputFilter;
		required?: boolean;
	}

	const getInputData = (
		inputs: SpecialInput[],
	): Array<NodeConnectionType | INodeInputConfiguration> => {
		const displayNames: { [key: string]: string } = {
			ai_languageModel: 'Model',
			ai_memory: 'Memory',
			ai_tool: 'Tool',
			ai_outputParser: 'Output Parser',
		};

		return inputs.map(({ type, filter }) => {
			const isModelType = type === 'ai_languageModel';
			let displayName = type in displayNames ? displayNames[type] : undefined;
			if (isModelType) {
				displayName = 'Chat Model';
			}
			const input: INodeInputConfiguration = {
				type,
				displayName,
				required: isModelType,
				maxConnections: ['ai_languageModel', 'ai_memory', 'ai_outputParser'].includes(
					type as NodeConnectionType,
				)
					? 1
					: undefined,
			};

			if (filter) {
				input.filter = filter;
			}

			return input;
		});
	};

	let specialInputs: SpecialInput[] = [
		{
			type: 'ai_languageModel',
			filter: {
				nodes: [
					'@n8n/n8n-nodes-langchain.lmChatAzureOpenAi',
					'@n8n/n8n-nodes-langchain.lmChatAwsBedrock',
					'@n8n/n8n-nodes-langchain.lmChatMistralCloud',
					'@n8n/n8n-nodes-langchain.lmChatOllama',
					'@n8n/n8n-nodes-langchain.lmChatOpenAi',
					'@n8n/n8n-nodes-langchain.lmChatGroq',
					'@n8n/n8n-nodes-langchain.lmChatGoogleVertex',
					'@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
					'@n8n/n8n-nodes-langchain.lmChatDeepSeek',
					'@n8n/n8n-nodes-langchain.lmChatOpenRouter',
					// Support WatsonX via custom extension
					'CUSTOM.lmChatWatsonX',
					'@bitovi/n8n-nodes-watsonx.lmChatWatsonX'
				],
			},
		},
		{
			type: 'ai_memory',
		},
		{
			type: 'ai_tool',
			required: true,
		},
		{
			type: 'ai_outputParser',
		},
	];

	if (hasOutputParser === false) {
		specialInputs = specialInputs.filter((input) => input.type !== 'ai_outputParser');
	}
	return ['main', ...getInputData(specialInputs)];
}

class AgentV2impl implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			version: 2,
			defaults: {
				name: 'AI Agent Custom Watsonx',
				color: '#404040',
			},
			inputs: `={{
				((hasOutputParser) => {
					${getInputs.toString()};
					return getInputs(hasOutputParser)
				})($parameter.hasOutputParser === undefined || $parameter.hasOutputParser === true)
			}}`,
			outputs: [NodeConnectionTypes.Main],
			properties: [
				{
					displayName:
						'Tip: Get a feel for agents with our quick <a href="https://docs.n8n.io/advanced-ai/intro-tutorial/" target="_blank">tutorial</a> or see an <a href="/templates/1954" target="_blank">example</a> of how this node works',
					name: 'notice_tip',
					type: 'notice',
					default: '',
				},
				promptTypeOptions,
				{
					...textFromPreviousNode,
					displayOptions: {
						show: {
							promptType: ['auto'],
						},
					},
				},
				{
					...textInput,
					displayOptions: {
						show: {
							promptType: ['define'],
						},
					},
				},
				{
					displayName: 'Require Specific Output Format',
					name: 'hasOutputParser',
					type: 'boolean',
					default: false,
					noDataExpression: true,
				},
				{
					displayName: `Connect an <a data-action='openSelectiveNodeCreator' data-action-parameter-connectiontype='${NodeConnectionTypes.AiOutputParser}'>output parser</a> on the canvas to specify the output format you require`,
					name: 'notice',
					type: 'notice',
					default: '',
					displayOptions: {
						show: {
							hasOutputParser: [true],
						},
					},
				},
				...toolsAgentProperties,
			],
		};
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await toolsAgentExecute.call(this);
	}
}
export class AgentV2custom extends VersionedNodeType {
	constructor() {
		const baseDescription: INodeTypeBaseDescription = {
			displayName: 'WatsonX AI Agent',
			name: 'agentV2custom', // A unique internal name
			icon: 'file:IBM_watsonx_logo.svg',
			group: ['transform'],
			description: 'A custom agent that connects to WatsonX.',
			defaultVersion: 2,
		};

		const nodeVersions: IVersionedNodeType['nodeVersions'] = {
			2: new AgentV2impl(baseDescription),
		};

		super(nodeVersions, baseDescription);
	}
}
