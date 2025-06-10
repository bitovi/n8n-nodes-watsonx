import { type INodeType, type INodeTypeDescription, type IExecuteFunctions } from 'n8n-workflow';

import { ChatWatsonx } from '@langchain/community/chat_models/ibm';

export class LmChatWatsonX implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WatsonX LLM',
		name: 'lmChatWatsonX',
		icon: 'file:IBM_watsonx_logo.svg',
		// @ts-ignore
		nodeType: 'languageModel',
		group: ['transform'],
		version: 1.0,
		defaults: { name: 'WatsonX LLM' },
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: ['ai_languageModel'],
		outputNames: ['Model'],
		credentials: [{ name: 'watsonxApi', required: true }],
		properties: [
			// The 'options' field for model selection has been replaced with a 'string' field.
			{
				displayName: 'Model ID',
				name: 'modelId',
				type: 'string',
				default: 'ibm/granite-3-3-8b-instruct',
				required: true,
				description: 'The ID of the model to use, e.g., "meta-llama/llama-3-1-70b-instruct"',
			},
			{
				displayName: 'API Version',
				name: 'version',
				type: 'string',
				default: '2024-05-31',
				required: true,
			},
		],
	};
	async supplyData(this: IExecuteFunctions, itemIndex: number) {
		const credentials = await this.getCredentials('watsonxApi', itemIndex);

		const modelId = this.getNodeParameter('modelId', itemIndex) as string;

		const props: any = {
			//these are top level inputs from credentials used for both iam and bearer auth
			model: modelId,
			version: this.getNodeParameter('version', itemIndex),
			parameters: this.getNodeParameter('parameters', itemIndex, {}),
			projectId: credentials.projectId,
		};

		if (credentials.environmentType === 'iam') {
			//langchain auth for iam
			const region = credentials.ibmCloudRegion;
			props.watsonxAIAuthType = 'iam';
			props.watsonxAIApikey = credentials.ibmCloudApiKey;
			props.serviceUrl = `https://${region}.ml.cloud.ibm.com`;
		} else {
			//langchain auth for iam
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
			//define inputs for langchain
			const accessToken = authResponse.token;

			console.log('DEBUG - CP4D bearer token acquired:', !!accessToken);
			props.watsonxAIAuthType = 'bearertoken';
			props.watsonxAIBearerToken = accessToken;
			props.serviceUrl = baseUrl;
			console.log('DEBUG - props handed to ChatWatsonx:', {
				authType: props.watsonxAIAuthType,
				hasToken: !!props.watsonxAIBearerToken,
				serviceUrl: props.serviceUrl,
			});
		}

		const model = new ChatWatsonx(props);
		return { response: model };
	}
}

module.exports = { LmChatWatsonX };
