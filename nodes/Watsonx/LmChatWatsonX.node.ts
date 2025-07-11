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
import {
	watsonxDescription,
	watsonxModel,
	watsonxVersion,
	watsonxOptions,
} from '../llms/WatsonX/description';

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
		inputs: [],
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		// Use shared WatsonX description fields
		credentials: watsonxDescription.credentials,
		requestDefaults: watsonxDescription.requestDefaults,
		properties: [watsonxModel, watsonxVersion, watsonxOptions],
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

		this.logger.debug(
			'--------------------------------------------------------------------------------------Initializing ChatWatsonx with props:',
			props,
		);
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
