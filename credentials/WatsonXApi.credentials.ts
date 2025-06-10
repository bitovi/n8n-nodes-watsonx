// WatsonXApi.ts

import {
	Icon,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class WatsonXApi implements ICredentialType {
	name = 'watsonxApi';
	displayName = 'WatsonX API';
	documentationUrl = 'https://js.langchain.com/docs/integrations/llms/ibm';
	icon: Icon = 'file:IBM_watsonx_logo.svg';


	properties: INodeProperties[] = [

		{
			displayName: 'Environment Type',
			name: 'environmentType',
			type: 'options',
			options: [
				{ name: 'IBM Cloud (IAM Auth)', value: 'iam' },
				{ name: 'On-Premise (CP4D Auth)', value: 'cp4d' },
			],
			default: 'iam',
			description: 'Select the authentication method for your environment.',
		},
		{
			displayName: 'Project ID',
			name: 'projectId',
			type: 'string',
			default: '',
			required: true,
			description: 'Your Watsonx.ai project ID. Found in the "Manage" tab of your WatsonX project.',
		},

		// --- IBM Cloud (iam) Fields ---
		{
			displayName: 'IBM Cloud API Key',
			name: 'ibmCloudApiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			displayOptions: { show: { environmentType: ['iam'] } },
			description: 'Your IBM Cloud IAM API Key.',
		},
		{
			displayName: 'IBM Cloud Region',
			name: 'ibmCloudRegion',
			type: 'options',
			options: [
				{ name: 'Dallas (us-south)', value: 'us-south' },
				{ name: 'London (eu-gb)', value: 'eu-gb' },
				{ name: 'Frankfurt (eu-de)', value: 'eu-de' },
				{ name: 'Tokyo (jp-tok)', value: 'jp-tok' },
			],
			default: 'us-south',
			displayOptions: { show: { environmentType: ['iam'] } },
			description: 'The region where your WatsonX.ai service is hosted.',
		},

		// --- On-Premise (cp4d) Fields ---
		{
			displayName: 'On-Premise URL',
			name: 'onPremiseUrl',
			type: 'string',
			default: '',
			required: true,
			displayOptions: { show: { environmentType: ['cp4d'] } },
			placeholder: 'e.g., https://your-watsonx-host.com',
			description: 'The base URL for your on-premise Cloud Pak for Data instance.',
		},
		{
			displayName: 'On-Premise Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
			displayOptions: { show: { environmentType: ['cp4d'] } },
		},
		{
			displayName: 'On-Premise API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			displayOptions: { show: { environmentType: ['cp4d'] } },
			description: 'Your username-associated API key from your CP4D profile.'
		},
	];
}
