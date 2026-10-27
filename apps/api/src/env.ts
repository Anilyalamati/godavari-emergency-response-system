import 'dotenv/config';
import { z } from 'zod';

const optionalEnvironmentString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

const optionalEnvironmentUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
);

export const ApiEnvironmentSchema = z
  .object({
    API_PORT: z.coerce.number().int().min(1024).max(65535).default(4000),
    API_HOST: z.string().min(1).default('0.0.0.0'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SUPABASE_URL: optionalEnvironmentUrl,
    SUPABASE_PUBLISHABLE_KEY: optionalEnvironmentString,
    SUPABASE_SECRET_KEY: optionalEnvironmentString,
    SUPABASE_INVITE_REDIRECT_URL: optionalEnvironmentUrl,
  })
  .superRefine((environment, context) => {
    const hasUrl = environment.SUPABASE_URL !== undefined;
    const hasPublishableKey = environment.SUPABASE_PUBLISHABLE_KEY !== undefined;

    if (hasUrl !== hasPublishableKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasUrl ? 'SUPABASE_PUBLISHABLE_KEY' : 'SUPABASE_URL'],
        message: 'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured together.',
      });
    }

    if (environment.SUPABASE_SECRET_KEY && !hasUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_URL'],
        message: 'A server-side Supabase URL is required when a secret key is configured.',
      });
    }

    if (environment.SUPABASE_INVITE_REDIRECT_URL && !hasUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_URL'],
        message: 'A Supabase URL is required when an invitation redirect is configured.',
      });
    }
  });

export type ApiEnvironment = z.infer<typeof ApiEnvironmentSchema>;

export function parseApiEnvironment(
  environment: NodeJS.ProcessEnv | Record<string, string | undefined>,
) {
  return ApiEnvironmentSchema.parse(environment);
}
