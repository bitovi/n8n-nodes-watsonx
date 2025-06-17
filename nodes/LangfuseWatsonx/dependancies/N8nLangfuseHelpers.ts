import type { Langfuse, LangfuseSpanClient } from 'langfuse';

export function slugifyWorkflowName(name: string){
	return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export async function langfuseEnd(langfuse: Langfuse, span: LangfuseSpanClient, logger: any) {
	logger.log("[WatsonX-Langfuse] Closing Langfuse...");
	await span.end();
	await (langfuse.flushAsync ? langfuse.flushAsync() : langfuse.flush?.());
}