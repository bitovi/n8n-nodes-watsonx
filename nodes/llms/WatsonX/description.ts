import type { INodeProperties, INodeTypeDescription } from 'n8n-workflow';

// Shared WatsonX node description for use in LLM and Embeddings nodes
export const watsonxDescription: Partial<INodeTypeDescription> = {
	credentials: [
		{
			name: 'watsonxApi',
			required: true,
		},
	],
	requestDefaults: {
		ignoreHttpStatusErrors: true,
		baseURL: '={{ $credentials.baseUrl.replace(new RegExp("/$"), "") }}',
	},
};

export const watsonxModel: INodeProperties = {
	displayName: 'Model Name or ID',
	name: 'modelId',
	type: 'options',
	default: '',
	required: true,
	description:
		'Choose one of the foundation or custom models available to your account. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code-examples/expressions/">expression</a>.',
	typeOptions: {
		loadOptionsMethod: 'getAvailableModels',
	},
};

export const watsonxVersion: INodeProperties = {
	displayName: 'API Version',
	name: 'version',
	type: 'string',
	default: '2024-05-31',
	required: true,
};

export const watsonxOptions: INodeProperties = {
	displayName: 'Options',
	name: 'options',
	placeholder: 'Add Option',
	description: "Additional options to control the model's behavior",
	type: 'collection',
	default: {},
	options: [
		{
			displayName: 'Maximum Number of Tokens',
			name: 'maxTokens',
			type: 'number',
			default: 1024,
			typeOptions: { minValue: 1 },
			description: 'The maximum number of *new* tokens to generate in the completion',
		},
		{
			displayName: 'Sampling Temperature',
			name: 'temperature',
			type: 'number',
			default: 0.7,
			typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
			description:
				'Controls randomness: Lowering results in less random completions. As the temperature approaches zero, the model will become deterministic and repetitive.',
		},
		{
			displayName: 'Top K',
			name: 'topK',
			type: 'number',
			default: 50,
			typeOptions: { minValue: 1, maxValue: 100 },
			description:
				'The number of highest probability vocabulary tokens to keep for top-k-filtering',
		},
		{
			displayName: 'Top P',
			name: 'topP',
			type: 'number',
			default: 1,
			typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 1 },
			description:
				'Controls diversity via nucleus sampling: 0.5 means half of all likelihood-weighted options are considered',
		},
		{
			displayName: 'Output Format',
			name: 'outputFormat',
			type: 'options',
			options: [
				{ name: 'Default', value: 'default' },
				{ name: 'JSON', value: 'json' },
			],
			default: 'default',
			description: 'Specifies the format of the API response',
		},
	],
};
