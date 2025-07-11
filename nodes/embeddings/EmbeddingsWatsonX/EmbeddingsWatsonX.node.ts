/* eslint-disable n8n-nodes-base/node-dirname-against-convention */
import { WatsonxEmbeddings } from '@langchain/community/embeddings/ibm';

import {
	type ILoadOptionsFunctions,
	INodePropertyOptions,
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

import { getConnectionHintNoticeField } from './dependencies/sharedFields';

export class EmbeddingsWatsonX implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Embeddings WatsonX',
		name: 'embeddingsWatsonX',
		icon: 'file:IBM_watsonx_logo.svg',
		group: ['transform'],
		version: 1,
		description: 'Use WatsonX Embeddings',
		defaults: {
			name: 'Embeddings WatsonX',
		},

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
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Embeddings'],
			},
		},
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.AiEmbedding],
		outputNames: ['Embeddings'],
		properties: [
			getConnectionHintNoticeField([NodeConnectionTypes.AiVectorStore]),

			{
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
			},

			{
				displayName: 'API Version',
				name: 'version',
				type: 'string',
				default: '2024-05-31',
				required: true,
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				description: "Additional options to control the model's behavior",
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
			},
		],
	};
	methods = {
		loadOptions: {
			async getAvailableModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const creds = await this.getCredentials('watsonxApi');
					const apiVersion = '2024-05-31';

					let serviceUrl: string;
					let headers: Record<string, string> = {};

					if (creds.environmentType === 'iam') {
						serviceUrl = `https://${creds.ibmCloudRegion}.ml.cloud.ibm.com`;
						headers.Authorization = `Bearer ${creds.ibmCloudApiKey}`;
					} else {
						const baseUrl = (creds.onPremiseUrl as string).replace(/\/$/, '');
						const authUrl = `${baseUrl}/icp4d-api/v1/authorize`;
						const { token } = await this.helpers.httpRequest({
							method: 'POST',
							url: authUrl,
							body: { username: creds.username, api_key: creds.apiKey },
							json: true,
						});
						serviceUrl = baseUrl;
						headers.Authorization = `Bearer ${token}`;
					}

					const specRes = await this.helpers.httpRequest({
						method: 'GET',
						url: `${serviceUrl}/ml/v1/foundation_model_specs`,
						qs: { version: apiVersion },
						headers,
						json: true,
					});

					const specs = specRes.resources ?? specRes;
					return specs.map(
						(spec: any): INodePropertyOptions => ({
							name: spec.name ?? spec.model_id,
							value: spec.model_id,
							description: spec.description ?? '',
						}),
					);
				} catch (err) {
					this.logger.error(`[WatsonX Node] Failed to fetch model list: ${err.message}`);
					return [];
				}
			},
		},
	};
	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		this.logger.debug('Supply data for embeddings WatsonX');
		const modelName = this.getNodeParameter('modelId', itemIndex) as string;

		const credentials = await this.getCredentials('watsonxApi', itemIndex);
		const apiVersion = this.getNodeParameter('version', itemIndex) as string;
		const region = credentials.ibmCloudRegion;

		const embeddings = new WatsonxEmbeddings({
			projectId: credentials.projectId as string,
			model: modelName,
			version: apiVersion,
			watsonxAIAuthType: 'iam',
			watsonxAIApikey: credentials.ibmCloudApiKey as string,
			serviceUrl: `https://${region}.ml.cloud.ibm.com`,
		});

		return {
			response: embeddings,
		};
	}
}
