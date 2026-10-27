import { createApp } from './app.js';
import { ApiEnvironmentSchema } from './env.js';

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
const app = createApp({ environment });

app.listen(API_PORT, API_HOST, () => {
  console.log(`Godavari prototype API listening on ${API_HOST}:${API_PORT}`);
});
