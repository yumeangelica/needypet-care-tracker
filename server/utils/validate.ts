import type { H3Event } from 'h3';
import { z } from 'zod';

/**
 * Reads and validates the request body against a zod schema. Failures return
 * the same 422 shape the old API used:
 *   { message: 'Validation error', errorDetails: { field: [messages] } }
 */
export async function readValidatedBodyOr422<Schema extends z.ZodType>(
  event: H3Event,
  schema: Schema,
): Promise<z.output<Schema>> {
  const body = await readBody(event);
  const result = schema.safeParse(body);
  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation error',
      data: {
        message: 'Validation error',
        errorDetails: z.flattenError(result.error).fieldErrors,
      },
    });
  }
  return result.data;
}
