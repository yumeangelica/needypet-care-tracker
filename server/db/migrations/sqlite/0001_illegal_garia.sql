ALTER TABLE `users` ADD `digest_opt_in` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_digest_date` text;