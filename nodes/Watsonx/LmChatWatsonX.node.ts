import {NodeConnectionTypes, type INodeType, type INodeTypeDescription, type ISupplyDataFunctions, type SupplyData} from 'n8n-workflow';

import { ChatWatsonx } from '@langchain/community/chat_models/ibm';
interface IWatsonxOptions {
	decoding_method?: 'greedy' | 'sample';
	temperature?: number;
	maxNewTokens?: number;
	minNewTokens?: number;
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
		description: 'For advanced usage with an AI chain',
    defaults: { name: 'WatsonX LLM' },
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
    inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
    outputs: [NodeConnectionTypes.AiLanguageModel],
    outputNames: ['Model'],
    credentials: [{ name: 'watsonxApi', required: true }],
    properties: [
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
      },{
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        description: "Additional options to control the model's behavior",
        options: [
  {
    displayName: 'Decoding Method',
    name: 'decoding_method',
    type: 'options',
    default: 'sample',
    options: [
      { name: 'Greedy', value: 'greedy' },
      { name: 'Sample', value: 'sample' },
    ],
    description: 'The method for decoding tokens. "greedy" is deterministic, "sample" introduces randomness.',
  },
  {
    displayName: 'Maximum Number of Tokens',
    name: 'maxNewTokens',
    type: 'number',
    default: 1024,
    typeOptions: { minValue: 1 },
    description: 'The maximum number of *new* tokens to generate in the completion',
  },
  {
    displayName: 'Minimum Number of Tokens',
    name: 'minNewTokens',
    type: 'number',
    default: 1,
    typeOptions: { minValue: 0 },
    description: 'The minimum number of *new* tokens to generate in the completion',
  },
  {
    displayName: 'Sampling Temperature',
    name: 'temperature',
    type: 'number',
    default: 0.7,
    typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
    description: 'Controls randomness: Lowering results in less random completions. As the temperature approaches zero, the model will become deterministic and repetitive.',
  },
  {
    displayName: 'Top K',
    name: 'topK',
    type: 'number',
    default: 50,
    typeOptions: { minValue: 1, maxValue: 100 },
    description: 'The number of highest probability vocabulary tokens to keep for top-k-filtering',
  },
  {
    displayName: 'Top P',
    name: 'topP',
    type: 'number',
    default: 1,
    typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 1 },
    description: 'Controls diversity via nucleus sampling: 0.5 means half of all likelihood-weighted options are considered',
  },
],
      },
    ],
  };

  async supplyData(this: ISupplyDataFunctions, itemIndex: number):Promise<SupplyData> {
    const credentials = await this.getCredentials('watsonxApi', itemIndex);

    const modelId = this.getNodeParameter('modelId', itemIndex) as string;
		const options = this.getNodeParameter('options', itemIndex, {}) as IWatsonxOptions;
    const props: any = { //these are top level inputs from credentials used for both iam and bearer auth
      model: modelId,
      version: this.getNodeParameter('version', itemIndex),
      parameters: this.getNodeParameter('parameters', itemIndex, {}),
      projectId: credentials.projectId,
			...options,

    };

    if (credentials.environmentType === 'iam') { //langchain auth for iam
      const region = credentials.ibmCloudRegion;
      props.watsonxAIAuthType = 'iam';
      props.watsonxAIApikey = credentials.ibmCloudApiKey;
      props.serviceUrl = `https://${region}.ml.cloud.ibm.com`;
    } else { //langchain auth for iam
      const baseUrl = (credentials.onPremiseUrl as string).replace(/\/$/, '');
      const authUrl = `${baseUrl}/icp4d-api/v1/authorize`;

      const authResponse = await this.helpers.httpRequest({ //get bearer token via json http
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
