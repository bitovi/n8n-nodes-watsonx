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

