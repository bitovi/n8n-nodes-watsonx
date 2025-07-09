/* eslint-disable n8n-nodes-base/node-dirname-against-convention */
import { WatsonxEmbeddings } from '@langchain/community/embeddings/ibm';

import {
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

//import { logWrapper } from '@utils/logWrapper';
import { getConnectionHintNoticeField } from './dependencies/sharedFields';

//import { ollamaDescription, ollamaModel } from '../../llms/LMOllama/description';

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
		//...ollamaDescription,
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Embeddings'],
			},
			//resources: {
			//primaryDocumentation: [
			//{
			//url: 'https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.embeddingsollama/',
			//},
			//],
			//},
		},
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.AiEmbedding],
		outputNames: ['Embeddings'],
		properties: [
			getConnectionHintNoticeField([NodeConnectionTypes.AiVectorStore]),
			//ollamaModel
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		this.logger.debug('Supply data for embeddings WatsonX');
		const modelName = this.getNodeParameter('model', itemIndex) as string;

		const credentials = await this.getCredentials('watsonxApi', itemIndex);
		const apiVersion = '2024-05-31'; // keep in sync with default
		const region = credentials.ibmCloudRegion;

		const embeddings = new WatsonxEmbeddings({
			projectId: credentials.projectId,
			version: apiVersion,
			watsonxAIAuthType: 'iam',
			watsonxAIApikey: credentials.ibmCloudApiKey,
			serviceUrl: `https://${region}.ml.cloud.ibm.com`,
		});

		return {
			response: embeddings,
		};
	}
}
