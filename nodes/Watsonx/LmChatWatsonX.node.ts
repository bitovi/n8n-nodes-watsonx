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
import { watsonxDescription, watsonxModel, watsonxVersion } from '../llms/WatsonX/description';

interface IWatsonxOptions {
	temperature?: number;
	maxTokens?: number;
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
		properties: [
			watsonxModel,
			watsonxVersion,

			{
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
							{
								name: 'Default',
								value: 'default',
								description: 'No JSON enforcement',
							},
							{
								name: 'JSON Mode with Prompt Injection',
								value: 'json_with_prompt',
								description: 'Enables native JSON output and adds an instruction to the prompt to ensure reliability (Recommended)',
							},
							{
								name: 'JSON Mode Only (No Prompt Injection)',
								value: 'json_only',
								description: 'Enables native JSON output without modifying the prompt (Advanced)',
							},
						],
						default: 'default',
						description: 'Configures the model for JSON output. WARNING: If not using "JSON with Prompt Injection" option, ' +
							'ensure system/user prompt informs AI to use JSON if not the AI may generate infinite new line tokens.',
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


		// The entire purpose of this section is to enforce JSON output format.
		if (outputFormat === 'json_with_prompt' || outputFormat === 'json_only') {
			this.logger.debug('Applying native JSON mode via .withConfig()');
			model = model.withConfig({
				responseFormat: { type: 'json_object' },
			});
			// This rest of this code will append the JSON instruction to the prompt to comply with IBM documentation.
			// It can work without this code; however, this ensures that the instruction is always applied when using
			// the `json` output format. If not used may generate infinite /n tokens in the response.
			if (outputFormat === 'json_with_prompt') {
				this.logger.debug('Wrapping model with a Proxy to enforce JSON instruction in the prompt.');

				const jsonInstruction =
					'\n\nIMPORTANT: Your final output must be a single, valid JSON object and nothing else. Do not include any text, explanations, or markdown formatting before or after the JSON object.';

				const handler = {
					get: (target: any, prop: string | symbol, receiver: any) => {
						if (prop === 'invoke' || prop === 'stream') {
							const originalMethod = target[prop];

							return async (input: any, options: any) => {
								this.logger.debug(`[Proxy] Wrapped '${String(prop)}' has been called.`);
								this.logger.debug(`[Proxy] Input content: ${JSON.stringify(input, null, 2)}`);

								let modifiedInput = input;

								// DUCK-TYPING: Check for the structure of a PromptValue-like object
								if (
									typeof input === 'object' &&
									input !== null &&
									typeof input.value === 'string' &&
									typeof input.toChatMessages === 'function'
								) {
									this.logger.debug('[Proxy] Detected PromptValue-like object. Re-instantiating with modified value.');

									modifiedInput = new input.constructor(input.value + jsonInstruction);

									this.logger.debug(`[Proxy] Final prompt being sent to model: ${JSON.stringify(modifiedInput)}`);
								} else if (Array.isArray(input)) {
									const messages = [...input];
									if (messages.length > 0) {
										const lastMessage = messages[messages.length - 1];
										if (lastMessage && typeof lastMessage.content === 'string') {
											lastMessage.content += jsonInstruction;
											modifiedInput = messages;
										}
									}
								} else if (typeof input === 'string') {
									this.logger.debug('[Proxy] Input is a string. Appending JSON instruction.');
									modifiedInput = input + jsonInstruction;
								} else {
									this.logger.warn('[Proxy] Input was not a recognized type. Passing through without modification.');
								}

								return originalMethod.call(target, modifiedInput, options);
							};
						}

						return Reflect.get(target, prop, receiver);
					},
				};

				model = new Proxy(model, handler);
			}
		}

		return { response: model };
	}
}

module.exports = { LmChatWatsonX };
