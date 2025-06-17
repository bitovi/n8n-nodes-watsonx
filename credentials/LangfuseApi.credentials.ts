class LangfuseApi {
  constructor() {
    this.name = 'langfuseApi';
    this.displayName = 'Langfuse API';
    this.documentationUrl = 'https://docs.langfuse.com';
    this.properties = [
      {
        displayName: 'Public Key',
        name: 'publicKey',
        type: 'string',
        default: '',
        required: true,
      },
      {
        displayName: 'Secret Key',
        name: 'secretKey',
        type: 'string',
        default: '',
        required: true,
      },
      {
        displayName: 'Base URL',
        name: 'baseUrl',
        type: 'string',
        default: 'http://localhost:3001',
        //placeholder: 'http://host.docker.internal:3001',
        required: true,
      },
    ];

    this.test = {
      request: {
        method: 'GET',
        url: '={{$credentials.baseUrl}}/api/public/health',
        headers: {
          Authorization: 'Bearer {{$credentials.secretKey}}',
        },
      },
    };
  }
}

module.exports = {
  LangfuseApi,
};