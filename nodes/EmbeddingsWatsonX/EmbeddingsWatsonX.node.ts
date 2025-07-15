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
