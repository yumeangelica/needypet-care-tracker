CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_reset_at_idx` ON `rate_limits` (`reset_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `user_name_key` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `users` ADD `session_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Hand-edited: SQLite cannot ADD a NOT NULL column without a default when rows
-- exist, so the column lands with DEFAULT '' and pre-existing rows are
-- backfilled with lower() (ASCII fallback; app code and the legacy import
-- always write the NFKC-normalized key). A case collision among existing rows
-- fails closed at the unique index below.
UPDATE `users` SET `user_name_key` = lower(`user_name`) WHERE `user_name_key` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `users_user_name_key_idx` ON `users` (`user_name_key`);
