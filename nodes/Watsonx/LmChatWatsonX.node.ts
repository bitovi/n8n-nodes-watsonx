import {
	NodeConnectionTypes,
	type ILoadOptionsFunctions,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
	INodePropertyOptions,
} from 'n8n-workflow';
import { N8nLlmTracing } from './depedancies/N8nLlmTracing';
import { N8nLangfuseHandler } from './depedancies/N8nLangfuseHandler';
import { makeN8nLlmFailedAttemptHandler } from './depedancies/n8nLlmFailedAttemptHandler';
import { ChatWatsonx } from '@langchain/community/chat_models/ibm';

interface IWatsonxOptions {
	temperature?: number;
	maxTokens?: number;
	topK?: number;
	topP?: number;
}
export class LmChatWatsonX implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WatsonX LLM',
		name: 'lmChatWatsonX',
		icon: 'file:IBM_watsonx_logo.svg',
		group: ['transform'],
		version: 1.0,
		description: 'For advanced usage with an AI chain and tracked via Langfuse',
		defaults: { name: 'WatsonX LLM' },
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [{ name: 'watsonxApi', required: true }],
		properties: [
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
						type: 'options',options: [
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
					const apiVersion = '2024-05-31'; // keep in sync with default

					let serviceUrl: string;
					let headers: Record<string, string> = {};

					if (creds.environmentType === 'iam') {
						serviceUrl = `https://${creds.ibmCloudRegion}.ml.cloud.ibm.com`;
						headers.Authorization = `Bearer ${creds.ibmCloudApiKey}`;
					} else {
						// CP4D → exchange user/api_key for bearer token
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
		const credentials = await this.getCredentials('watsonxApi', itemIndex);
		const modelId = this.getNodeParameter('modelId', itemIndex) as string;
		const options = this.getNodeParameter('options', itemIndex, {}) as IWatsonxOptions;
		const callbacks: any[] = [new N8nLlmTracing(this)];

		//Langfuse Handler Creation
		try {
			if (process.env.LANGFUSE_HOST) {
				this.logger.debug('[WatsonX-Langfuse] Initializing Langfuse Callback Handler...');
				const langfuse = new N8nLangfuseHandler({
					publicKey: process.env.LANGFUSE_PUBLIC_KEY,
					secretKey: process.env.LANGFUSE_SECRET_KEY,
					baseUrl: process.env.LANGFUSE_HOST,
					metadata: {
						modelName: modelId,
						workflowName: this.getWorkflow().name as string,
					},
					logger: this.logger,
				});
				callbacks.push(langfuse);
				this.logger.debug('[WatsonX-Langfuse] Langfuse handler initialized, added to callbacks.');
			}
		} catch (error) {
			this.logger.debug(
				'[WatsonX-Langfuse] Langfuse credentials not found or invalid, skipping Langfuse tracing.',
			);
		}

		const props: any = {
			model: modelId,
			version: this.getNodeParameter('version', itemIndex),
			projectId: credentials.projectId,
			stream: false,
			...options,
			callbacks,
			onFailedAttempt: makeN8nLlmFailedAttemptHandler(this),
		};
		const outputFormat = props.outputFormat;
    delete props.outputFormat;

    // This property is not used by the constructor, so we can clean it up
    delete props.stream;
		if (credentials.environmentType === 'iam') {
			const region = credentials.ibmCloudRegion;
			props.watsonxAIAuthType = 'iam';
			props.watsonxAIApikey = credentials.ibmCloudApiKey;
			props.serviceUrl = `https://${region}.ml.cloud.ibm.com`;
		} else {
			// Let LangChain handle bearer token exchange
			const baseUrl = (credentials.onPremiseUrl as string).replace(/\/$/, '');
			const authUrl = `${baseUrl}/icp4d-api/v1/authorize`;
			const authResponse = await this.helpers.httpRequest({
				//get bearer token via json http
				method: 'POST',
				url: authUrl,
				body: {
					username: credentials.username,
					api_key: credentials.apiKey,
				},
				json: true,
			});
			const accessToken = authResponse.token;
			console.log('DEBUG - CP4D bearer token acquired:', !!accessToken);
			props.watsonxAIAuthType = 'bearertoken';
			props.watsonxAIUsername = credentials.username;
			props.watsonxAIBearerToken = accessToken;
			props.serviceUrl = baseUrl;
		}

		this.logger.debug('--------------------------------------------------------------------------------------Initializing ChatWatsonx with props:', props);
		let model: any = new ChatWatsonx(props);
		if (outputFormat === 'json') {
        this.logger.debug('Applying native JSON mode via .withConfig()');
        model = model.withConfig({
            responseFormat: { type: 'json_object' },
        });
    }

		return { response: model };
	}
}

module.exports = { LmChatWatsonX };
