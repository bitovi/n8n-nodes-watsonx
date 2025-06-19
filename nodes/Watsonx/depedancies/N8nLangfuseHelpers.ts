import type { Langfuse, LangfuseSpanClient } from 'langfuse';

export function slugifyWorkflowName(name: string) {
	return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export async function langfuseEnd(logger: any, logName: string, langfuse: Langfuse, spans: LangfuseSpanClient[]) {
	logger.debug(`[${logName}] Flushing Langfuse...`);
	for (var s = 0; s < spans.length; s++ ) {
		await spans[s].end();
	}
	await (langfuse.flushAsync ? langfuse.flushAsync() : langfuse.flush?.());
}
