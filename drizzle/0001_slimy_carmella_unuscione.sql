CREATE TABLE `pass_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`instructor_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`plan_id` text,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`sessions_included` integer,
	`validity_days` integer,
	`note` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`expires_at` integer,
	`redeemed_by` text,
	`redeemed_at` integer,
	`enrollment_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`offering_id`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `pricing_plans`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`redeemed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pass_codes_code_unique` ON `pass_codes` (`code`);--> statement-breakpoint
CREATE INDEX `pass_code_instructor_idx` ON `pass_codes` (`instructor_id`,`status`);--> statement-breakpoint
CREATE INDEX `pass_code_offering_idx` ON `pass_codes` (`offering_id`);--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_reset_tokens_token_hash_unique` ON `password_reset_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `reset_user_idx` ON `password_reset_tokens` (`user_id`);