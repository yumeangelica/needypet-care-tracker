import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { hashUserPassword } from '../utils/password';
import { addDaysDateOnly, todayInTimeZone } from '../../shared/utils/date';
import { instantToIso } from '../../shared/utils/datetime';
import { Temporal } from '../../shared/utils/temporal';
import { useDb } from './index';
import { careRecords, needs, petCaretakers, pets, users } from './schema';

/**
 * Local development seed. Resets the local SQLite dev database and fills it
 * with a small demo family:
 *
 *   owner:     demo   / DemoPaws123!   (Europe/Helsinki)
 *   caretaker: helper / HelperPaws123! (Europe/Helsinki, cares for Bella)
 *
 * Run with: bun run db:seed
 */

if (process.env.NUXT_DB_URL) {
  throw new Error('db:seed is a local SQLite dev tool - refusing to run against a remote DB (NUXT_DB_URL)');
}

const db = useDb();
migrate(db, { migrationsFolder: 'server/db/migrations/sqlite' });

const now = instantToIso(Temporal.Now.instant());
const today = todayInTimeZone('Europe/Helsinki');
const yesterday = addDaysDateOnly(today, -1);
const yesterdayStamp = instantToIso(Temporal.Now.instant().subtract({ hours: 24 }));
const id = () => crypto.randomUUID();

// Reset previous seed data (local dev database only).
await db.delete(careRecords);
await db.delete(needs);
await db.delete(petCaretakers);
await db.delete(pets);
await db.delete(users);

const ownerId = id();
const helperId = id();

await db.insert(users)
  .values([
    {
      id: ownerId,
      userName: 'demo',
      email: 'demo@example.com',
      passwordHash: await hashUserPassword('DemoPaws123!'),
      emailConfirmed: true,
      timezone: 'Europe/Helsinki',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: helperId,
      userName: 'helper',
      email: 'helper@example.com',
      passwordHash: await hashUserPassword('HelperPaws123!'),
      emailConfirmed: true,
      timezone: 'Europe/Helsinki',
      createdAt: now,
      updatedAt: now,
    },
  ]);

const bellaId = id();
const mistyId = id();
const nuppuId = id();

await db.insert(pets)
  .values([
    {
      id: bellaId,
      ownerId,
      name: 'Bella',
      species: 'Dog',
      breed: 'Golden Retriever',
      description: 'Sunshine in dog form. Will trade anything for belly rubs.',
      birthday: '2021-05-14',
      imageSource: 'preset',
      imageKey: 'dog',
      lastRolledNeedDate: today,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: mistyId,
      ownerId,
      name: 'Misty',
      species: 'Cat',
      breed: 'Domestic Shorthair',
      description: 'Professional napper, part-time zoomies athlete.',
      birthday: '2019-11-02',
      imageSource: 'preset',
      imageKey: 'cat',
      // One day behind on purpose: the first authenticated pets read after
      // seeding demonstrates the lazy rollover live.
      lastRolledNeedDate: yesterday,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: nuppuId,
      ownerId,
      name: 'Nuppu',
      species: 'Bunny',
      breed: 'Mini Lop',
      description: 'Tiny, fluffy, extremely serious about hay.',
      birthday: null,
      imageSource: 'preset',
      imageKey: 'bunny',
      lastRolledNeedDate: today,
      createdAt: now,
      updatedAt: now,
    },
  ]);

// helper cares for Bella only (caretakers see just their assigned pets).
await db.insert(petCaretakers).values({ petId: bellaId, userId: helperId, createdAt: now });

const breakfastNeedId = id();
const yesterdayBreakfastNeedId = id();
const freshWaterNeedId = id();
const yesterdayWalkNeedId = id();
const mistyWaterNeedId = id();

await db.insert(needs)
  .values([
    // Yesterday's rolled-over history for Bella so day navigation has content.
    {
      id: yesterdayBreakfastNeedId,
      petId: bellaId,
      dateFor: yesterday,
      category: 'Breakfast',
      description: 'Dry food in the slow-feed bowl.',
      quantityValue: 100,
      quantityUnit: 'g',
      completed: true,
      archived: true,
      isActive: false,
      createdAt: yesterdayStamp,
      updatedAt: yesterdayStamp,
    },
    {
      id: yesterdayWalkNeedId,
      petId: bellaId,
      dateFor: yesterday,
      category: 'Evening walk',
      description: 'Around the park, sniff breaks included.',
      durationValue: 30,
      durationUnit: 'minutes',
      completed: true,
      archived: true,
      isActive: false,
      createdAt: yesterdayStamp,
      updatedAt: yesterdayStamp,
    },
    {
      id: id(),
      petId: bellaId,
      dateFor: today,
      category: 'Evening walk',
      description: 'Around the park, sniff breaks included.',
      durationValue: 30,
      durationUnit: 'minutes',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: breakfastNeedId,
      petId: bellaId,
      dateFor: today,
      category: 'Breakfast',
      description: 'Dry food in the slow-feed bowl.',
      quantityValue: 100,
      quantityUnit: 'g',
      completed: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      petId: bellaId,
      dateFor: today,
      category: 'Playtime',
      description: 'Tug of war or fetch, her pick.',
      durationValue: 15,
      durationUnit: 'minutes',
      isActive: false, // paused: stays on this day, won't roll forward
      createdAt: now,
      updatedAt: now,
    },
    // Partially logged today: demos the progress line and partial logging UI.
    {
      id: freshWaterNeedId,
      petId: bellaId,
      dateFor: today,
      category: 'Fresh water',
      description: 'Rinse the bowl and refill.',
      quantityValue: 300,
      quantityUnit: 'ml',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: mistyWaterNeedId,
      petId: mistyId,
      dateFor: yesterday,
      category: 'Fresh water',
      description: 'Rinse the fountain and refill.',
      quantityValue: 200,
      quantityUnit: 'ml',
      createdAt: yesterdayStamp,
      updatedAt: yesterdayStamp,
    },
  ]);

// The completed breakfasts were logged by the caretaker (audit fields included).
await db.insert(careRecords)
  .values([
    {
      id: id(),
      needId: breakfastNeedId,
      petId: bellaId,
      careTakerId: helperId,
      date: now,
      note: 'Ate everything, very proud of herself.',
      quantityValue: 100,
      quantityUnit: 'g',
      timezone: 'Europe/Helsinki',
      createdAt: now,
    },
    {
      id: id(),
      needId: yesterdayBreakfastNeedId,
      petId: bellaId,
      careTakerId: helperId,
      date: yesterdayStamp,
      note: 'Slow start, finished it all.',
      quantityValue: 100,
      quantityUnit: 'g',
      timezone: 'Europe/Helsinki',
      createdAt: yesterdayStamp,
    },
    // A partial log by the owner: the need stays open at 100/300 ml.
    {
      id: id(),
      needId: freshWaterNeedId,
      petId: bellaId,
      careTakerId: ownerId,
      date: now,
      note: 'Morning refill.',
      quantityValue: 100,
      quantityUnit: 'ml',
      timezone: 'Europe/Helsinki',
      createdAt: now,
    },
    // History spread for the care diary: owner logged Misty's water yesterday.
    {
      id: id(),
      needId: mistyWaterNeedId,
      petId: mistyId,
      careTakerId: ownerId,
      date: yesterdayStamp,
      note: '',
      quantityValue: 200,
      quantityUnit: 'ml',
      timezone: 'Europe/Helsinki',
      createdAt: yesterdayStamp,
    },
    // A record whose author's account is gone: the UI shows "Deleted account".
    {
      id: id(),
      needId: yesterdayWalkNeedId,
      petId: bellaId,
      careTakerId: null,
      date: yesterdayStamp,
      note: 'Lovely sunset lap around the park.',
      quantityValue: null,
      quantityUnit: null,
      durationValue: 30,
      durationUnit: 'minutes',
      timezone: 'Europe/Helsinki',
      createdAt: yesterdayStamp,
    },
  ]);

console.log('Seeded local database for', today);
console.log('  owner:     demo   / DemoPaws123!');
console.log('  caretaker: helper / HelperPaws123!');
