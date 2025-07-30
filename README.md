# @bitovi/n8n-nodes-watsonx

This is an n8n community node that lets you use IBM watsonx.ai in your n8n workflows.

IBM watsonx.ai is an enterprise-ready AI and data platform designed to multiply the impact of AI across your business. It provides access to foundation models for language, code, and multimodal tasks, with options for both IBM Cloud and on-premise Cloud Pak for Data deployments.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)  

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

Alternative installation method:
- Make sure to allow community nodes with `N8N_COMMUNITY_PACKAGES_ENABLED=true`
- Once logged in to your N8N web UI, go to `/settings/community-nodes` and type `@bitovi/n8n-nodes-watsonx`

## Operations

This package provides three nodes for different AI operations:

### WatsonX LLM
- **Chat completion**: Generate text responses using IBM watsonx foundation models
- **Model selection**: Choose from available foundation models in your watsonx instance
- **Parameter control**: Configure temperature, max tokens, top-p, and other model parameters
- **Langfuse integration**: Built-in tracking and monitoring of LLM interactions

### WatsonX AI Agent
- **AI Agent execution**: Create autonomous agents that can use tools and make decisions
- **Tool integration**: Connect with n8n tools and external APIs
- **Memory support**: Maintain conversation context across interactions
- **Output parsing**: Structure agent responses with custom output formats
- **Iteration control**: Set maximum iterations and return intermediate steps
- **System message customization**: Define agent behavior and personality
- **Batch Processing, returning Intermediate Steps and more!**

### Embeddings WatsonX
- **Text embeddings**: Convert text into vector representations for semantic search
- **Model selection**: Use watsonx embedding models for your specific use case
- **Vector store integration**: Connect directly with n8n vector store nodes

## Credentials

To use this node, you need to authenticate with IBM watsonx.ai. The package supports two authentication methods:

### Prerequisites
- An IBM watsonx.ai account (either IBM Cloud or Cloud Pak for Data)
- A watsonx project with appropriate permissions
- API credentials for your chosen environment

### Authentication Methods

#### IBM Cloud (IAM Authentication)
For IBM Cloud-hosted watsonx.ai:
1. **IBM Cloud API Key**: Your IBM Cloud IAM API Key
2. **Project ID**: Your watsonx.ai project ID (found in the "Manage" tab of your project)
3. **Region**: Select your IBM Cloud region (us-south, eu-gb, eu-de, or jp-tok)

#### On-Premise (Cloud Pak for Data Authentication)
For on-premise Cloud Pak for Data instances:
1. **On-Premise URL**: The base URL of your CP4D instance (e.g., https://your-watsonx-host.com)
2. **Username**: Your CP4D username
3. **API Key**: Your username-associated API key from your CP4D profile
4. **Project ID**: Your watsonx.ai project ID

### Setting up Credentials
1. In n8n, go to **Settings** > **Credentials**
2. Click **Add Credential** and search for "WatsonX API"
3. Select your environment type (IBM Cloud or On-Premise)
4. Fill in the required fields based on your chosen authentication method
5. Test the connection to ensure it's working properly

## Compatibility

- **Minimum n8n version**: 1.94.0
- **Node.js**: 18.10 or higher
- **Package manager**: pnpm 9.1 or higher
- **Tested on n8n 1.104.1**

This package is tested against 1.104.1 of n8n and is regularly updated to maintain compatibility.

## Usage

### Basic LLM Usage
1. Add the **WatsonX LLM** node to your workflow
2. Configure your watsonx credentials
3. Select a foundation model from the dropdown
4. Connect to other n8n nodes to process input and output

### Creating AI Agents
1. Add the **AgentV2 Custom** node to your workflow
2. Connect a **WatsonX LLM** node as the chat model
3. Add any tools your agent should have access to
4. Configure the system message to define agent behavior
5. Optionally add memory and output parsers for more advanced functionality

### Working with Embeddings
1. Add the **Embeddings WatsonX** node to your workflow
2. Configure your watsonx credentials
3. Select an embedding model
4. Connect to vector store nodes for semantic search capabilities

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
* [IBM watsonx.ai documentation](https://www.ibm.com/docs/en/watsonx-as-a-service)
* [Langchain IBM integration documentation](https://js.langchain.com/docs/integrations/llms/ibm)
* [IBM Cloud API documentation](https://cloud.ibm.com/apidocs)

## Need help or have questions?

Need guidance on leveraging AI agents or N8N for your business? Our [AI Agents workshop](https://hubs.ly/Q02X-9Qq0) will equip you with the knowledge and tools necessary to implement successful and valuable agentic workflows.

## License

[MIT](./LICENSE.md)
