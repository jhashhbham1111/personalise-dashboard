CREATE TABLE `instructor_follows` (
	`id` text PRIMARY KEY NOT NULL,
	`instructor_id` text NOT NULL,
	`follower_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instructor_follow_unique` ON `instructor_follows` (`follower_id`,`instructor_id`);--> statement-breakpoint
CREATE INDEX `instructor_follow_instructor_idx` ON `instructor_follows` (`instructor_id`);--> statement-breakpoint
CREATE TABLE `video_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `video_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_like_unique` ON `video_likes` (`video_id`,`user_id`);