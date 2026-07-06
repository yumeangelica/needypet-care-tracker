CREATE TABLE "care_records" (
	"id" text PRIMARY KEY NOT NULL,
	"legacy_id" text,
	"need_id" text NOT NULL,
	"pet_id" text NOT NULL,
	"care_taker_id" text,
	"date" text NOT NULL,
	"note" text,
	"duration_value" integer,
	"duration_unit" text,
	"quantity_value" double precision,
	"quantity_unit" text,
	"timezone" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "care_records_legacy_id_unique" UNIQUE("legacy_id"),
	CONSTRAINT "care_records_exactly_one_measurement" CHECK (num_nonnulls("care_records"."duration_value", "care_records"."quantity_value") = 1),
	CONSTRAINT "care_records_duration_unit" CHECK ("care_records"."duration_unit" IS NULL OR "care_records"."duration_unit" = 'minutes'),
	CONSTRAINT "care_records_quantity_unit" CHECK ("care_records"."quantity_unit" IS NULL OR "care_records"."quantity_unit" IN ('ml', 'g'))
);
--> statement-breakpoint
CREATE TABLE "needs" (
	"id" text PRIMARY KEY NOT NULL,
	"legacy_id" text,
	"pet_id" text NOT NULL,
	"date_for" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"duration_value" integer,
	"duration_unit" text,
	"quantity_value" double precision,
	"quantity_unit" text,
	"completed" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "needs_legacy_id_unique" UNIQUE("legacy_id"),
	CONSTRAINT "needs_exactly_one_measurement" CHECK (num_nonnulls("needs"."duration_value", "needs"."quantity_value") = 1),
	CONSTRAINT "needs_duration_unit" CHECK ("needs"."duration_unit" IS NULL OR "needs"."duration_unit" = 'minutes'),
	CONSTRAINT "needs_quantity_unit" CHECK ("needs"."quantity_unit" IS NULL OR "needs"."quantity_unit" IN ('ml', 'g'))
);
--> statement-breakpoint
CREATE TABLE "pet_caretakers" (
	"pet_id" text NOT NULL,
	"user_id" text NOT NULL,
	"legacy_pet_id" text,
	"legacy_user_id" text,
	"created_at" text NOT NULL,
	CONSTRAINT "pet_caretakers_pet_id_user_id_pk" PRIMARY KEY("pet_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" text PRIMARY KEY NOT NULL,
	"legacy_id" text,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"species" text,
	"breed" text,
	"description" text,
	"birthday" text,
	"image_source" text DEFAULT 'preset' NOT NULL,
	"image_key" text DEFAULT 'cat',
	"image_url" text,
	"image_storage_key" text,
	"last_rolled_need_date" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "pets_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"legacy_id" text,
	"user_name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"email_confirmed" boolean DEFAULT false NOT NULL,
	"email_confirm_token" text,
	"email_confirm_expires_at" text,
	"password_reset_token" text,
	"password_reset_expires_at" text,
	"timezone" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "users_legacy_id_unique" UNIQUE("legacy_id"),
	CONSTRAINT "users_user_name_unique" UNIQUE("user_name"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "care_records" ADD CONSTRAINT "care_records_need_id_needs_id_fk" FOREIGN KEY ("need_id") REFERENCES "public"."needs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_records" ADD CONSTRAINT "care_records_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_records" ADD CONSTRAINT "care_records_care_taker_id_users_id_fk" FOREIGN KEY ("care_taker_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "needs" ADD CONSTRAINT "needs_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_caretakers" ADD CONSTRAINT "pet_caretakers_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_caretakers" ADD CONSTRAINT "pet_caretakers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "care_records_need_idx" ON "care_records" USING btree ("need_id");--> statement-breakpoint
CREATE INDEX "needs_pet_date_idx" ON "needs" USING btree ("pet_id","date_for");--> statement-breakpoint
CREATE INDEX "needs_pet_archived_idx" ON "needs" USING btree ("pet_id","archived");--> statement-breakpoint
CREATE INDEX "pet_caretakers_user_idx" ON "pet_caretakers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pets_owner_idx" ON "pets" USING btree ("owner_id");