ALTER TABLE `payments` ADD `plan_id` text REFERENCES pricing_plans(id);--> statement-breakpoint
ALTER TABLE `payments` ADD `provider_checkout_url` text;