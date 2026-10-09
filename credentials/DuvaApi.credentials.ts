import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class DuvaApi implements ICredentialType {
	name = 'duvaApi';

	displayName = 'Duva API';

	documentationUrl = 'https://github.com/duva-mail/duva-n8n#credentials';

	icon = { light: 'file:../nodes/Duva/duva.svg', dark: 'file:../nodes/Duva/duva.dark.svg' } as const;

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'The API key created for your domain in the Duva dashboard (API keys). It only opens that domain.',
		},
		{
			displayName: 'Domain',
			name: 'domain',
			type: 'string',
			default: '',
			placeholder: 'example.com',
			required: true,
			description: 'The sending domain the API key belongs to',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.duva.ca',
			description: 'Only change this for a test environment',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '=/v1/{{$credentials.domain}}/suppressions',
			qs: { limit: 1 },
		},
	};
}
