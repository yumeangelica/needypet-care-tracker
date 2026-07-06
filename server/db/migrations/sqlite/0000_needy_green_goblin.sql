CREATE TABLE `care_records` (
	`id` text PRIMARY KEY NOT NULL,
	`legacy_id` text,
	`need_id` text NOT NULL,
	`pet_id` text NOT NULL,
	`care_taker_id` text,
	`date` text NOT NULL,
	`note` text,
	`duration_value` integer,
	`duration_unit` text,
	`quantity_value` real,
	`quantity_unit` text,
	`timezone` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`need_id`) REFERENCES `needs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`care_taker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "care_records_exactly_one_measurement" CHECK(("care_records"."duration_value" IS NOT NULL) + ("care_records"."quantity_value" IS NOT NULL) = 1),
	CONSTRAINT "care_records_duration_unit" CHECK("care_records"."duration_unit" IS NULL OR "care_records"."duration_unit" = 'minutes'),
	CONSTRAINT "care_records_quantity_unit" CHECK("care_records"."quantity_unit" IS NULL OR "care_records"."quantity_unit" IN ('ml', 'g'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `care_records_legacy_id_unique` ON `care_records` (`legacy_id`);--> statement-breakpoint
CREATE INDEX `care_records_need_idx` ON `care_records` (`need_id`);--> statement-breakpoint
CREATE TABLE `needs` (
	`id` text PRIMARY KEY NOT NULL,
	`legacy_id` text,
	`pet_id` text NOT NULL,
	`date_for` text NOT NULL,
	`category` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`duration_value` integer,
	`duration_unit` text,
	`quantity_value` real,
	`quantity_unit` text,
	`completed` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "needs_exactly_one_measurement" CHECK(("needs"."duration_value" IS NOT NULL) + ("needs"."quantity_value" IS NOT NULL) = 1),
	CONSTRAINT "needs_duration_unit" CHECK("needs"."duration_unit" IS NULL OR "needs"."duration_unit" = 'minutes'),
	CONSTRAINT "needs_quantity_unit" CHECK("needs"."quantity_unit" IS NULL OR "needs"."quantity_unit" IN ('ml', 'g'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `needs_legacy_id_unique` ON `needs` (`legacy_id`);--> statement-breakpoint
CREATE INDEX `needs_pet_date_idx` ON `needs` (`pet_id`,`date_for`);--> statement-breakpoint
CREATE INDEX `needs_pet_archived_idx` ON `needs` (`pet_id`,`archived`);--> statement-breakpoint
CREATE TABLE `pet_caretakers` (
	`pet_id` text NOT NULL,
	`user_id` text NOT NULL,
	`legacy_pet_id` text,
	`legacy_user_id` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`pet_id`, `user_id`),
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pet_caretakers_user_idx` ON `pet_caretakers` (`user_id`);--> statement-breakpoint
CREATE TABLE `pets` (
	`id` text PRIMARY KEY NOT NULL,
	`legacy_id` text,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`species` text,
	`breed` text,
	`description` text,
	`birthday` text,
	`image_source` text DEFAULT 'preset' NOT NULL,
	`image_key` text DEFAULT 'cat',
	`image_url` text,
	`image_storage_key` text,
	`last_rolled_need_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pets_legacy_id_unique` ON `pets` (`legacy_id`);--> statement-breakpoint
CREATE INDEX `pets_owner_idx` ON `pets` (`owner_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`legacy_id` text,
	`user_name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`email_confirmed` integer DEFAULT false NOT NULL,
	`email_confirm_token` text,
	`email_confirm_expires_at` text,
	`password_reset_token` text,
	`password_reset_expires_at` text,
	`timezone` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_legacy_id_unique` ON `users` (`legacy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_user_name_unique` ON `users` (`user_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);