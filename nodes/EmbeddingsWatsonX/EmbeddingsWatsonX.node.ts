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
import { watsonxDescription, watsonxModel, watsonxVersion } from '../llms/WatsonX/description';

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
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Embeddings'],
			},
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiEmbedding],
		outputNames: ['Embeddings'],
		// Use shared WatsonX description fields
		credentials: watsonxDescription.credentials,
		requestDefaults: watsonxDescription.requestDefaults,
		properties: [
			getConnectionHintNoticeField([NodeConnectionTypes.AiVectorStore]),
			watsonxModel,
			watsonxVersion,
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

		// Prepare callbacks and onFailedAttempt if supported (for parity)
		//const callbacks: any[] = [];
		// If you have tracing or error handling for embeddings, add here
		// Example: callbacks.push(new N8nLlmTracing(this));
		// const onFailedAttempt = makeN8nLlmFailedAttemptHandler?.(this);

		let props: any = {
			projectId: credentials.projectId as string,
			model: modelName,
			version: apiVersion,
			// callbacks, // Uncomment if WatsonxEmbeddings supports callbacks
			// onFailedAttempt, // Uncomment if WatsonxEmbeddings supports onFailedAttempt
		};

		if (credentials.environmentType === 'iam') {
			const region = credentials.ibmCloudRegion;
			props = {
				...props,
				watsonxAIAuthType: 'iam',
				watsonxAIApikey: credentials.ibmCloudApiKey as string,
				serviceUrl: `https://${region}.ml.cloud.ibm.com`,
			};
		} else {
			// On-premise/CP4D: exchange username/apiKey for bearer token
			const baseUrl = (credentials.onPremiseUrl as string).replace(/\/$/, '');
			const authUrl = `${baseUrl}/icp4d-api/v1/authorize`;
			const authResponse = await this.helpers.httpRequest({
				method: 'POST',
				url: authUrl,
				body: {
					username: credentials.username,
					api_key: credentials.apiKey,
				},
				json: true,
			});
			const accessToken = authResponse.token;
			props = {
				...props,
				watsonxAIAuthType: 'bearertoken',
				watsonxAIUsername: credentials.username as string,
				watsonxAIBearerToken: accessToken,
				serviceUrl: baseUrl,
			};
		}

		this.logger.debug(
			'--------------------------------------------------------------------------------------Initializing EmbeddingsWatsonX with props:',
			props,
		);
		const embeddings = new WatsonxEmbeddings({ ...props });

		return {
			response: embeddings,
		};
	}
}
