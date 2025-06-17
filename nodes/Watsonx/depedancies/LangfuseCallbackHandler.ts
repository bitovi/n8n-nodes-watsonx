const { Langfuse } = require('langfuse');
const { BaseCallbackHandler } = require('@langchain/core/callbacks/base');

class LangfuseN8nHandler extends BaseCallbackHandler {
  constructor(config) {
    super();
    this.name = 'LangfuseN8nHandler';
    this.langfuse = new Langfuse({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl,
      debug: true,
    });
    this.input = null;
    this.startTime = null;
    this.llmName = null;
  }

  async handleLLMStart(llm, prompts) {
    this.startTime = new Date();
    this.llmName = llm?.model || 'ollama';
    const raw = Array.isArray(prompts) ? prompts[0] : prompts;
    this.input = typeof raw === 'string'
      ? raw.replace(/^Human:\s*/, '')
      : raw?.text || String(raw);
  }

  async handleLLMEnd(output, runId, parentRunId, tags, metadata) {
    metadata = metadata || {};

    // Parse output
    let text = '[missing output]';
    if (output?.generations) {
      const gens = output.generations;
      text = Array.isArray(gens[0]) ? gens[0][0]?.text : gens[0]?.text;
    }

    const endTime = new Date();

    // Extract usage tokens
    let promptTokens = 0, completionTokens = 0, totalTokens = 0;
    try {
      const gens = output.generations;
      const msg = Array.isArray(gens[0]) ? gens[0][0].message : gens[0].message;
      const usage = msg.kwargs?.usage_metadata || {};
      promptTokens = usage.input_tokens || 0;
      completionTokens = usage.output_tokens || 0;
      totalTokens = usage.total_tokens || (promptTokens + completionTokens);
    } catch {}

    const trace = this.langfuse.trace({
      name: metadata.traceName || `${this.llmName}-trace`,
      userId: metadata.userId || 'n8n-user',
      sessionId: metadata.sessionId,
      tags: metadata.tags || tags || [],
      metadata: {
        model: this.llmName,
        promptTokens,
        completionTokens,
        totalTokens,
        ...(metadata.extraMetadata || {}),
        startTime: this.startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    });

    await trace.update({
      input: this.input,
      output: text,
      startTime: this.startTime,
      endTime,
    });

    const span = trace.span({ name: `${this.llmName}-inference` });
    await span.update({
      input: this.input,
      output: text,
      startTime: this.startTime,
      endTime,
    });
    await span.end();

    await (this.langfuse.flushAsync ? this.langfuse.flushAsync() : this.langfuse.flush());
  }
}

module.exports = { LangfuseN8nHandler };