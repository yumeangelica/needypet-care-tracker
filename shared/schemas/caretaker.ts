import { z } from 'zod';
import { userNameSchema } from './user';

export const caretakerAddSchema = z.object({
  userName: userNameSchema,
});

export type CaretakerAddInput = z.infer<typeof caretakerAddSchema>;
