CREATE TABLE `email_verification_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_verification_user_idx` ON `email_verification_codes` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` integer;--> statement-breakpoint
--
-- Everyone who already has an account is treated as verified.
--
-- Verification exists to stop a *new* signup inventing an address. Applying it
-- retroactively would lock the pilot's real instructors and students out of
-- their own accounts on the next deploy, to prove something about addresses
-- that were already vouched for by hand. So the cut is at this migration:
-- accounts before it are trusted, accounts after it verify.
--
UPDATE `users` SET `email_verified_at` = `created_at` WHERE `email_verified_at` IS NULL;