import { z } from 'zod';
import { isValidDateOnly } from '../utils/date';

export const petImageSchema = z.object({
  source: z.literal('preset'),
  key: z.enum(['dog', 'cat', 'bunny']),
});

/**
 * Birthday is date-only. Whether it lies in the future is checked server-side
 * against the owner's timezone, not here.
 */
export const birthdaySchema = z
  .string()
  .refine(isValidDateOnly, { message: 'Birthday must be a valid date' });

export const petSchema = z.object({
  name: z
    .string()
    .min(3, 'Name must be at least 3 characters')
    .max(40, 'Name must be at most 40 characters'),
  species: z.string().max(30, 'Species must be at most 30 characters').optional().default(''),
  breed: z.string().max(30, 'Breed must be at most 30 characters').optional().default(''),
  description: z
    .string()
    .max(2000, 'Description must be at most 2000 characters')
    .optional()
    .default(''),
  birthday: birthdaySchema.nullable().optional(),
  image: petImageSchema.optional(),
});

export type PetInput = z.infer<typeof petSchema>;
