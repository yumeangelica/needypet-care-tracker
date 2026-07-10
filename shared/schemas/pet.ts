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
  .refine(isValidDateOnly, { message: 'validation.birthdayInvalid' });

export const petSchema = z.object({
  name: z
    .string()
    .min(3, 'validation.petNameMin')
    .max(40, 'validation.petNameMax'),
  species: z.string().max(30, 'validation.speciesMax').optional().default(''),
  breed: z.string().max(30, 'validation.breedMax').optional().default(''),
  description: z
    .string()
    .max(2000, 'validation.petDescriptionMax')
    .optional()
    .default(''),
  birthday: birthdaySchema.nullable().optional(),
  image: petImageSchema.optional(),
});

export type PetInput = z.infer<typeof petSchema>;
