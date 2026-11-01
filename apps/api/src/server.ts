import { createApp } from './app.js';
import { ApiEnvironmentSchema } from './env.js';
import { createStaffApiService } from './services/staff-service.js';
import { EscalationWorker } from './workers/escalation-worker.js';

const parsedEnvironment = ApiEnvironmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const invalidKeys = [
    ...new Set(parsedEnvironment.error.issues.map((issue) => String(issue.path[0]))),
  ];
  console.error(`Invalid API environment. Check: ${invalidKeys.join(', ')}`);
  process.exit(1);
}

const environment = parsedEnvironment.data;
const { API_HOST, API_PORT } = environment;
const staffService = createStaffApiService(environment);
const app = createApp({ environment, service: staffService });

let escalationWorker: EscalationWorker | null = null;
if (staffService) {
  escalationWorker = new EscalationWorker(staffService, { intervalMs: 10_000 });
  escalationWorker.start();
}

const server = app.listen(API_PORT, API_HOST, () => {
  console.log(`Godavari prototype API listening on ${API_HOST}:${API_PORT}`);
});

function handleShutdown() {
  if (escalationWorker) {
    escalationWorker.stop();
  }
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
