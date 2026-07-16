import { beforeAll, describe, expect, it } from 'vitest';
import { todayInTimeZone } from '../../shared/utils/date';
import {
  addCaretaker,
  api,
  createNeed,
  createPet,
  createRecord,
  createUser,
  createUserWithSession,
  errorMessage,
  getRecordRows,
  uniqueName,
} from './helpers';

const TZ = 'Europe/Helsinki';
const RECORD_BODY = { timezone: TZ, quantity: { value: 10, unit: 'ml' } };

/**
 * The permission matrix: owner vs caretaker vs stranger vs anonymous across
 * pets, needs, care records and caretaker management. Fixture pets are
 * stamped rolled-for-today so lazy rollover stays out of the picture.
 */
describe('permission matrix', () => {
  let owner: Awaited<ReturnType<typeof createUserWithSession>>;
  let caretaker: Awaited<ReturnType<typeof createUserWithSession>>;
  let stranger: Awaited<ReturnType<typeof createUserWithSession>>;
  let today: string;
  let pet: { id: string; name: string };
  let need: { id: string };
  let ownerRecordId: string;
  let caretakerRecordId: string;

  beforeAll(async () => {
    owner = await createUserWithSession({ timezone: TZ });
    caretaker = await createUserWithSession({ timezone: TZ });
    stranger = await createUserWithSession({ timezone: TZ });
    today = todayInTimeZone(TZ);
    pet = await createPet(owner.id, { lastRolledNeedDate: today });
    await addCaretaker(pet.id, caretaker.id);
    // Roomy target so the small records logged below never complete the need.
    need = await createNeed(pet.id, { dateFor: today, quantity: { value: 5000, unit: 'ml' } });
    ownerRecordId = (
      await createRecord({ needId: need.id, petId: pet.id, careTakerId: owner.id, quantity: { value: 10, unit: 'ml' } })
    ).id;
    caretakerRecordId = (
      await createRecord({ needId: need.id, petId: pet.id, careTakerId: caretaker.id, quantity: { value: 10, unit: 'ml' } })
    ).id;
  });

  describe('pet list and detail', () => {
    it('requires a session', async () => {
      expect((await api('/api/pets')).status).toBe(401);
      expect((await api(`/api/pets/${pet.id}`)).status).toBe(401);
    });

    it('lists the pet for owner and caretaker with the right isOwner flag', async () => {
      const ownerList = await api('/api/pets', { cookie: owner.cookie });
      expect(ownerList.status).toBe(200);
      expect(ownerList.body.find((p: any) => p.id === pet.id)?.isOwner).toBe(true);

      const caretakerList = await api('/api/pets', { cookie: caretaker.cookie });
      expect(caretakerList.body.find((p: any) => p.id === pet.id)?.isOwner).toBe(false);

      const strangerList = await api('/api/pets', { cookie: stranger.cookie });
      expect(strangerList.body.find((p: any) => p.id === pet.id)).toBeUndefined();
    });

    it('shows the care team to the owner only', async () => {
      const asOwner = await api(`/api/pets/${pet.id}`, { cookie: owner.cookie });
      expect(asOwner.status).toBe(200);
      expect(asOwner.body.caretakers).toEqual([{ id: caretaker.id, userName: caretaker.userName }]);

      const asCaretaker = await api(`/api/pets/${pet.id}`, { cookie: caretaker.cookie });
      expect(asCaretaker.status).toBe(200);
      expect(asCaretaker.body).not.toHaveProperty('caretakers');
    });

    it('403s a stranger and 404s a missing pet', async () => {
      expect((await api(`/api/pets/${pet.id}`, { cookie: stranger.cookie })).status).toBe(403);
      expect((await api(`/api/pets/${crypto.randomUUID()}`, { cookie: owner.cookie })).status).toBe(404);
    });
  });

  describe('pet mutations are owner-only', () => {
    it('PUT: owner 200, caretaker/stranger 403, anonymous 401', async () => {
      const body = { name: pet.name, species: 'Cat' };
      expect((await api(`/api/pets/${pet.id}`, { method: 'PUT', body })).status).toBe(401);
      expect((await api(`/api/pets/${pet.id}`, { method: 'PUT', body, cookie: caretaker.cookie })).status).toBe(403);
      expect((await api(`/api/pets/${pet.id}`, { method: 'PUT', body, cookie: stranger.cookie })).status).toBe(403);
      const asOwner = await api(`/api/pets/${pet.id}`, { method: 'PUT', body, cookie: owner.cookie });
      expect(asOwner.status).toBe(200);
    });

    it('DELETE: caretaker/stranger 403, owner 204', async () => {
      expect((await api(`/api/pets/${pet.id}`, { method: 'DELETE', cookie: caretaker.cookie })).status).toBe(403);
      expect((await api(`/api/pets/${pet.id}`, { method: 'DELETE', cookie: stranger.cookie })).status).toBe(403);

      const disposable = await createPet(owner.id, { lastRolledNeedDate: today });
      const res = await api(`/api/pets/${disposable.id}`, { method: 'DELETE', cookie: owner.cookie });
      expect(res.status).toBe(204);
    });
  });

  describe('need mutations are owner-only', () => {
    const needBody = () => ({
      dateFor: today,
      category: uniqueName('Care').slice(0, 50),
      duration: { value: 10, unit: 'minutes' },
    });

    it('POST: owner 201, caretaker/stranger 403, anonymous 401', async () => {
      expect((await api(`/api/pets/${pet.id}/needs`, { method: 'POST', body: needBody() })).status).toBe(401);
      expect((await api(`/api/pets/${pet.id}/needs`, { method: 'POST', body: needBody(), cookie: caretaker.cookie })).status).toBe(403);
      expect((await api(`/api/pets/${pet.id}/needs`, { method: 'POST', body: needBody(), cookie: stranger.cookie })).status).toBe(403);
      const asOwner = await api(`/api/pets/${pet.id}/needs`, { method: 'POST', body: needBody(), cookie: owner.cookie });
      expect(asOwner.status).toBe(201);
    });

    it('PUT, toggle and DELETE: caretaker 403, owner ok', async () => {
      const putBody = { category: 'Water bowl', quantity: { value: 5000, unit: 'ml' } };
      expect((await api(`/api/pets/${pet.id}/needs/${need.id}`, { method: 'PUT', body: putBody, cookie: caretaker.cookie })).status).toBe(403);
      expect((await api(`/api/pets/${pet.id}/needs/${need.id}/toggle`, { method: 'POST', cookie: caretaker.cookie })).status).toBe(403);
      expect((await api(`/api/pets/${pet.id}/needs/${need.id}`, { method: 'DELETE', cookie: caretaker.cookie })).status).toBe(403);

      const asOwnerPut = await api(`/api/pets/${pet.id}/needs/${need.id}`, { method: 'PUT', body: putBody, cookie: owner.cookie });
      expect(asOwnerPut.status).toBe(200);

      const paused = await api(`/api/pets/${pet.id}/needs/${need.id}/toggle`, { method: 'POST', cookie: owner.cookie });
      expect(paused.status).toBe(200);
      expect(paused.body.isActive).toBe(false);
      const resumed = await api(`/api/pets/${pet.id}/needs/${need.id}/toggle`, { method: 'POST', cookie: owner.cookie });
      expect(resumed.body.isActive).toBe(true);

      const disposable = await createNeed(pet.id, { dateFor: today, duration: { value: 5, unit: 'minutes' } });
      expect((await api(`/api/pets/${pet.id}/needs/${disposable.id}`, { method: 'DELETE', cookie: owner.cookie })).status).toBe(204);
    });
  });

  describe('care records', () => {
    it('POST: owner and caretaker 201, stranger 403, anonymous 401', async () => {
      expect((await api(`/api/pets/${pet.id}/needs/${need.id}/records`, { method: 'POST', body: RECORD_BODY })).status).toBe(401);
      expect((await api(`/api/pets/${pet.id}/needs/${need.id}/records`, { method: 'POST', body: RECORD_BODY, cookie: stranger.cookie })).status).toBe(403);
      expect((await api(`/api/pets/${pet.id}/needs/${need.id}/records`, { method: 'POST', body: RECORD_BODY, cookie: owner.cookie })).status).toBe(201);
      expect((await api(`/api/pets/${pet.id}/needs/${need.id}/records`, { method: 'POST', body: RECORD_BODY, cookie: caretaker.cookie })).status).toBe(201);
    });

    it('PATCH: owner edits anyone, caretaker only their own', async () => {
      const patchBody = { quantity: { value: 10, unit: 'ml' }, note: 'adjusted' };
      const base = `/api/pets/${pet.id}/needs/${need.id}/records`;

      expect((await api(`${base}/${caretakerRecordId}`, { method: 'PATCH', body: patchBody, cookie: owner.cookie })).status).toBe(200);
      expect((await api(`${base}/${caretakerRecordId}`, { method: 'PATCH', body: patchBody, cookie: caretaker.cookie })).status).toBe(200);
      const caretakerOnOwners = await api(`${base}/${ownerRecordId}`, { method: 'PATCH', body: patchBody, cookie: caretaker.cookie });
      expect(caretakerOnOwners.status).toBe(403);
      expect((await api(`${base}/${ownerRecordId}`, { method: 'PATCH', body: patchBody, cookie: stranger.cookie })).status).toBe(403);
    });

    it('404s a record reached through the wrong need', async () => {
      const otherNeed = await createNeed(pet.id, { dateFor: today, quantity: { value: 500, unit: 'ml' } });
      const res = await api(`/api/pets/${pet.id}/needs/${otherNeed.id}/records/${ownerRecordId}`, {
        method: 'PATCH',
        body: { quantity: { value: 10, unit: 'ml' } },
        cookie: owner.cookie,
      });
      expect(res.status).toBe(404);
    });

    it('DELETE: caretaker only their own, owner anyone', async () => {
      const base = `/api/pets/${pet.id}/needs/${need.id}/records`;
      const caretakerExtra = await createRecord({ needId: need.id, petId: pet.id, careTakerId: caretaker.id, quantity: { value: 10, unit: 'ml' } });
      const ownerExtra = await createRecord({ needId: need.id, petId: pet.id, careTakerId: owner.id, quantity: { value: 10, unit: 'ml' } });

      expect((await api(`${base}/${ownerExtra.id}`, { method: 'DELETE', cookie: caretaker.cookie })).status).toBe(403);
      expect((await api(`${base}/${caretakerExtra.id}`, { method: 'DELETE', cookie: caretaker.cookie })).status).toBe(204);
      expect((await api(`${base}/${ownerExtra.id}`, { method: 'DELETE', cookie: owner.cookie })).status).toBe(204);

      const remaining = await getRecordRows(need.id);
      expect(remaining.find((row) => row.id === ownerExtra.id)).toBeUndefined();
    });
  });

  describe('caretaker management', () => {
    let teamPet: { id: string };
    let helperA: Awaited<ReturnType<typeof createUserWithSession>>;
    let helperB: Awaited<ReturnType<typeof createUserWithSession>>;

    beforeAll(async () => {
      teamPet = await createPet(owner.id, { lastRolledNeedDate: today });
      helperA = await createUserWithSession({ timezone: TZ });
      helperB = await createUserWithSession({ timezone: TZ });
      await addCaretaker(teamPet.id, helperA.id);
      await addCaretaker(teamPet.id, helperB.id);
    });

    it('only the owner may invite', async () => {
      const body = { userName: stranger.userName };
      expect((await api(`/api/pets/${teamPet.id}/caretakers`, { method: 'POST', body, cookie: helperA.cookie })).status).toBe(403);
      expect((await api(`/api/pets/${teamPet.id}/caretakers`, { method: 'POST', body, cookie: stranger.cookie })).status).toBe(403);
    });

    it('validates the invite target', async () => {
      const unknown = await api(`/api/pets/${teamPet.id}/caretakers`, {
        method: 'POST',
        body: { userName: uniqueName('missing') },
        cookie: owner.cookie,
      });
      expect(unknown.status).toBe(400);
      expect(errorMessage(unknown.body)).toBe(
        "That username can't be added as a caretaker for this pet",
      );

      const self = await api(`/api/pets/${teamPet.id}/caretakers`, {
        method: 'POST',
        body: { userName: owner.userName },
        cookie: owner.cookie,
      });
      expect(self.status).toBe(400);
      expect(errorMessage(self.body)).toBe(
        "That username can't be added as a caretaker for this pet",
      );

      const duplicate = await api(`/api/pets/${teamPet.id}/caretakers`, {
        method: 'POST',
        body: { userName: helperA.userName },
        cookie: owner.cookie,
      });
      expect(duplicate.status).toBe(400);
      expect(errorMessage(duplicate.body)).toBe(
        "That username can't be added as a caretaker for this pet",
      );
    });

    it('owner invites a new caretaker', async () => {
      const invitee = await createUser({
        userName: `Mäyrä-${uniqueName('helper')}`,
        email: `${uniqueName('helper-mail')}@example.com`,
        timezone: TZ,
      });
      const res = await api(`/api/pets/${teamPet.id}/caretakers`, {
        method: 'POST',
        body: { userName: invitee.userName.toUpperCase() },
        cookie: owner.cookie,
      });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: invitee.id, userName: invitee.userName });
    });

    it('rate limits caretaker discovery attempts per owner', async () => {
      const limitedOwner = await createUserWithSession({ timezone: TZ });
      const limitedPet = await createPet(limitedOwner.id, { lastRolledNeedDate: today });
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const res = await api(`/api/pets/${limitedPet.id}/caretakers`, {
          method: 'POST',
          body: { userName: uniqueName('missing-helper') },
          cookie: limitedOwner.cookie,
        });
        expect(res.status).toBe(400);
      }
      const blocked = await api(`/api/pets/${limitedPet.id}/caretakers`, {
        method: 'POST',
        body: { userName: uniqueName('missing-helper') },
        cookie: limitedOwner.cookie,
      });
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('retry-after')).toBeTruthy();
    });

    it('removal: owner removes anyone, a caretaker only themself', async () => {
      const helperRemovesOther = await api(`/api/pets/${teamPet.id}/caretakers/${helperB.id}`, {
        method: 'DELETE',
        cookie: helperA.cookie,
      });
      expect(helperRemovesOther.status).toBe(403);

      const ownerRemoves = await api(`/api/pets/${teamPet.id}/caretakers/${helperB.id}`, {
        method: 'DELETE',
        cookie: owner.cookie,
      });
      expect(ownerRemoves.status).toBe(204);

      const missingLink = await api(`/api/pets/${teamPet.id}/caretakers/${helperB.id}`, {
        method: 'DELETE',
        cookie: owner.cookie,
      });
      expect(missingLink.status).toBe(404);

      const selfRemoval = await api(`/api/pets/${teamPet.id}/caretakers/${helperA.id}`, {
        method: 'DELETE',
        cookie: helperA.cookie,
      });
      expect(selfRemoval.status).toBe(204);
    });
  });
});
