import { handleJiraIssueEvent } from './handler';
import type { ForgeContext, JiraIssueEvent } from './types';

// Punto de entrada que Forge llama de verdad. manifest.yml lo referencia como
// "index.run". No hace nada por si mismo: solo delega en el handler, que es
// donde vive toda la logica real.
export async function run(event: JiraIssueEvent, context: ForgeContext): Promise<void> {
  await handleJiraIssueEvent(event, context);
}
