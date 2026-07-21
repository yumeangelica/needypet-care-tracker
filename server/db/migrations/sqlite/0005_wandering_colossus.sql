CREATE TABLE `need_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`legacy_id` text,
	`pet_id` text NOT NULL,
	`category` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`duration_value` integer,
	`duration_unit` text,
	`quantity_value` real,
	`quantity_unit` text,
	`recurrence_type` text DEFAULT 'daily' NOT NULL,
	`interval_days` integer,
	`weekdays` text,
	`anchor_date` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "need_schedules_exactly_one_measurement" CHECK(("need_schedules"."duration_value" IS NOT NULL) + ("need_schedules"."quantity_value" IS NOT NULL) = 1),
	CONSTRAINT "need_schedules_duration_unit" CHECK("need_schedules"."duration_unit" IS NULL OR "need_schedules"."duration_unit" = 'minutes'),
	CONSTRAINT "need_schedules_quantity_unit" CHECK("need_schedules"."quantity_unit" IS NULL OR "need_schedules"."quantity_unit" IN ('ml', 'g')),
	CONSTRAINT "need_schedules_recurrence_type" CHECK("need_schedules"."recurrence_type" IN ('daily', 'interval', 'weekly'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `need_schedules_legacy_id_unique` ON `need_schedules` (`legacy_id`);--> statement-breakpoint
CREATE INDEX `need_schedules_pet_idx` ON `need_schedules` (`pet_id`);--> statement-breakpoint
CREATE INDEX `need_schedules_pet_active_idx` ON `need_schedules` (`pet_id`,`is_active`);--> statement-breakpoint
ALTER TABLE `needs` ADD `schedule_id` text REFERENCES need_schedules(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `needs_schedule_date_idx` ON `needs` (`schedule_id`,`date_for`);--> statement-breakpoint
INSERT INTO `need_schedules` (`id`, `pet_id`, `category`, `description`, `duration_value`, `duration_unit`, `quantity_value`, `quantity_unit`, `recurrence_type`, `interval_days`, `weekdays`, `anchor_date`, `is_active`, `created_at`, `updated_at`)
SELECT
	lower(printf('%s-%s-4%s-%s%s-%s',
		hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2),
		substr('89ab', abs(random()) % 4 + 1, 1), substr(hex(randomblob(2)), 2),
		hex(randomblob(6)))),
	`pet_id`, `category`, `description`,
	`duration_value`, `duration_unit`, `quantity_value`, `quantity_unit`,
	'daily', NULL, NULL,
	min(`date_for`), max(`is_active`), min(`created_at`), min(`created_at`)
FROM `needs`
WHERE `archived` = 0
GROUP BY `pet_id`, `category`, `description`, `duration_value`, `duration_unit`, `quantity_value`, `quantity_unit`;--> statement-breakpoint
UPDATE `needs` SET `schedule_id` = (
	SELECT s.`id` FROM `need_schedules` s
	WHERE s.`pet_id` = `needs`.`pet_id`
		AND s.`category` = `needs`.`category`
		AND s.`description` = `needs`.`description`
		AND s.`duration_value` IS `needs`.`duration_value`
		AND s.`duration_unit` IS `needs`.`duration_unit`
		AND s.`quantity_value` IS `needs`.`quantity_value`
		AND s.`quantity_unit` IS `needs`.`quantity_unit`
)
WHERE `archived` = 0;