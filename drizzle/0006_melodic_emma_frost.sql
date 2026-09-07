CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_message_conversation_idx` ON `chat_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`instructor_id` text NOT NULL,
	`student_id` text NOT NULL,
	`last_message_at` integer,
	`last_message_preview` text,
	`instructor_read_at` integer,
	`student_read_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_pair_unique` ON `conversations` (`instructor_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `conversation_instructor_idx` ON `conversations` (`instructor_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `conversation_student_idx` ON `conversations` (`student_id`,`last_message_at`);