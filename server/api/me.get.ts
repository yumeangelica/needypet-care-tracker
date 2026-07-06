import { requireAppUser, toPublicUser } from '../utils/session';

export default defineEventHandler(async (event) => {
  return toPublicUser(await requireAppUser(event));
});
