CREATE TABLE `availability_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`instructor_id` text NOT NULL,
	`date` integer NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exception_unique` ON `availability_exceptions` (`instructor_id`,`date`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`student_id` text NOT NULL,
	`enrollment_id` text,
	`status` text DEFAULT 'CONFIRMED' NOT NULL,
	`attendance` text DEFAULT 'PENDING' NOT NULL,
	`waitlist_position` integer,
	`joined_at` integer,
	`booked_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`cancelled_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `class_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_unique` ON `bookings` (`session_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `booking_student_idx` ON `bookings` (`student_id`,`status`);--> statement-breakpoint
CREATE INDEX `booking_session_idx` ON `bookings` (`session_id`,`status`);--> statement-breakpoint
CREATE TABLE `class_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`offering_id` text NOT NULL,
	`instructor_id` text NOT NULL,
	`schedule_rule_id` text,
	`title` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`mode` text DEFAULT 'ONLINE' NOT NULL,
	`venue_id` text,
	`capacity` integer DEFAULT 20 NOT NULL,
	`status` text DEFAULT 'SCHEDULED' NOT NULL,
	`room_provider` text,
	`room_name` text,
	`live_started_at` integer,
	`live_ended_at` integer,
	`recording_id` text,
	`is_recording` integer DEFAULT false NOT NULL,
	`notes` text,
	`cancel_reason` text,
	`reminded_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`offering_id`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`schedule_rule_id`) REFERENCES `schedule_rules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_rule_start_unique` ON `class_sessions` (`schedule_rule_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `session_instructor_start_idx` ON `class_sessions` (`instructor_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `session_offering_start_idx` ON `class_sessions` (`offering_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `session_status_start_idx` ON `class_sessions` (`status`,`starts_at`);--> statement-breakpoint
CREATE INDEX `session_reminder_idx` ON `class_sessions` (`status`,`reminded_at`,`starts_at`);--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`instructor_id` text NOT NULL,
	`plan_id` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`sessions_remaining` integer,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer,
	`cancelled_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`offering_id`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `pricing_plans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `enrol_student_idx` ON `enrollments` (`student_id`,`status`);--> statement-breakpoint
CREATE INDEX `enrol_offering_idx` ON `enrollments` (`offering_id`);--> statement-breakpoint
CREATE INDEX `enrol_instructor_idx` ON `enrollments` (`instructor_id`);--> statement-breakpoint
CREATE TABLE `instructor_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`slug` text NOT NULL,
	`headline` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`disciplines` text DEFAULT '[]' NOT NULL,
	`languages` text DEFAULT '[]' NOT NULL,
	`certifications` text DEFAULT '[]' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`years_experience` integer DEFAULT 0 NOT NULL,
	`cover_image_url` text,
	`intro_video_url` text,
	`instagram_url` text,
	`youtube_url` text,
	`website_url` text,
	`is_verified` integer DEFAULT false NOT NULL,
	`verified_at` integer,
	`is_published` integer DEFAULT false NOT NULL,
	`is_suspended` integer DEFAULT false NOT NULL,
	`suspended_at` integer,
	`suspended_reason` text,
	`rating_avg` integer DEFAULT 0 NOT NULL,
	`rating_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instructor_profiles_user_id_unique` ON `instructor_profiles` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `instructor_profiles_slug_unique` ON `instructor_profiles` (`slug`);--> statement-breakpoint
CREATE INDEX `profiles_city_idx` ON `instructor_profiles` (`city`);--> statement-breakpoint
CREATE INDEX `profiles_published_idx` ON `instructor_profiles` (`is_published`);--> statement-breakpoint
CREATE INDEX `profiles_suspended_idx` ON `instructor_profiles` (`is_suspended`);--> statement-breakpoint
CREATE TABLE `moderation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`instructor_id` text NOT NULL,
	`admin_id` text,
	`admin_name` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admin_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `moderation_instructor_idx` ON `moderation_events` (`instructor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text DEFAULT 'GENERAL' NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`link` text,
	`read_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notif_user_idx` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `offerings` (
	`id` text PRIMARY KEY NOT NULL,
	`instructor_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`discipline` text DEFAULT 'Yoga' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`type` text DEFAULT 'GROUP_CLASS' NOT NULL,
	`mode` text DEFAULT 'ONLINE' NOT NULL,
	`level` text DEFAULT 'ALL_LEVELS' NOT NULL,
	`duration_min` integer DEFAULT 60 NOT NULL,
	`capacity` integer DEFAULT 20 NOT NULL,
	`cover_image_url` text,
	`venue_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offering_slug_unique` ON `offerings` (`instructor_id`,`slug`);--> statement-breakpoint
CREATE INDEX `offering_discipline_idx` ON `offerings` (`discipline`);--> statement-breakpoint
CREATE INDEX `offering_active_idx` ON `offerings` (`is_active`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`instructor_id` text NOT NULL,
	`enrollment_id` text,
	`booking_id` text,
	`invoice_no` text NOT NULL,
	`description` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`method` text DEFAULT 'UPI' NOT NULL,
	`provider` text DEFAULT 'mock' NOT NULL,
	`provider_order_id` text,
	`provider_payment_id` text,
	`status` text DEFAULT 'CREATED' NOT NULL,
	`failure_reason` text,
	`refunded_paise` integer DEFAULT 0 NOT NULL,
	`paid_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_invoice_no_unique` ON `payments` (`invoice_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_order_unique` ON `payments` (`provider_order_id`);--> statement-breakpoint
CREATE INDEX `payment_student_idx` ON `payments` (`student_id`,`status`);--> statement-breakpoint
CREATE INDEX `payment_instructor_idx` ON `payments` (`instructor_id`,`status`);--> statement-breakpoint
CREATE INDEX `payment_created_idx` ON `payments` (`created_at`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`instructor_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`cover_image_url` text,
	`type` text DEFAULT 'DAILY_UPDATE' NOT NULL,
	`visibility` text DEFAULT 'PUBLIC' NOT NULL,
	`published_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_instructor_idx` ON `posts` (`instructor_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `pricing_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`offering_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'PER_SESSION' NOT NULL,
	`amount_paise` integer NOT NULL,
	`sessions_included` integer,
	`validity_days` integer,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`offering_id`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plans_offering_idx` ON `pricing_plans` (`offering_id`);--> statement-breakpoint
CREATE TABLE `rate_limit_hits` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`window_start` integer NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_window_unique` ON `rate_limit_hits` (`key`,`window_start`);--> statement-breakpoint
CREATE INDEX `rate_limit_sweep_idx` ON `rate_limit_hits` (`window_start`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`instructor_id` text NOT NULL,
	`offering_id` text,
	`rating` integer NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`offering_id`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_unique` ON `reviews` (`student_id`,`instructor_id`);--> statement-breakpoint
CREATE INDEX `review_instructor_idx` ON `reviews` (`instructor_id`);--> statement-breakpoint
CREATE TABLE `saved_instructors` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`instructor_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_unique` ON `saved_instructors` (`student_id`,`instructor_id`);--> statement-breakpoint
CREATE TABLE `schedule_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`offering_id` text NOT NULL,
	`instructor_id` text NOT NULL,
	`days_of_week` text DEFAULT '[]' NOT NULL,
	`start_time_minutes` integer NOT NULL,
	`duration_min` integer DEFAULT 60 NOT NULL,
	`timezone` text DEFAULT 'Asia/Kolkata' NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer,
	`mode` text DEFAULT 'ONLINE' NOT NULL,
	`venue_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_materialized_to` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`offering_id`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `rules_offering_idx` ON `schedule_rules` (`offering_id`);--> statement-breakpoint
CREATE INDEX `rules_instructor_idx` ON `schedule_rules` (`instructor_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'STUDENT' NOT NULL,
	`phone` text,
	`avatar_url` text,
	`timezone` text DEFAULT 'Asia/Kolkata' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE TABLE `venues` (
	`id` text PRIMARY KEY NOT NULL,
	`instructor_id` text NOT NULL,
	`name` text NOT NULL,
	`address_line` text NOT NULL,
	`city` text NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`pincode` text DEFAULT '' NOT NULL,
	`landmark` text,
	`map_url` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `venues_instructor_idx` ON `venues` (`instructor_id`);--> statement-breakpoint
CREATE TABLE `video_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`instructor_id` text NOT NULL,
	`offering_id` text,
	`session_id` text,
	`title` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'VLOG' NOT NULL,
	`url` text NOT NULL,
	`thumbnail_url` text,
	`duration_sec` integer,
	`visibility` text DEFAULT 'PUBLIC' NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`published_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`offering_id`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`session_id`) REFERENCES `class_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `video_instructor_idx` ON `video_assets` (`instructor_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `video_visibility_idx` ON `video_assets` (`visibility`);