-- ============================================================
-- SECTION: SCHEMA
-- ============================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";


--
-- Name: EXTENSION "pg_graphql"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pg_graphql" IS 'pg_graphql: GraphQL support';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "pgcrypto"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pgcrypto" IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";


--
-- Name: EXTENSION "supabase_vault"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "supabase_vault" IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'order_status'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."order_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'modified',
    'withdrawn'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."user_role" AS ENUM (
    'user',
    'admin',
    'super_admin',
    'guest'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: can_manage_rest(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."can_manage_rest"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('admin', 'super_admin')
        OR EXISTS (
          SELECT 1 FROM positions pos
          WHERE pos.name = p.position
            AND pos.permissions @> '["排休管理"]'::jsonb
        )
      )
  );
$$;


--
-- Name: check_rest_conflict("uuid", "date", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."check_rest_conflict"("p_user_id" "uuid", "p_rest_date" "date", "p_rest_type" "text", "p_exclude_id" "uuid" DEFAULT NULL::"uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_existing_name text;
BEGIN
  SELECT p.display_name INTO v_existing_name
  FROM rest_schedule r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.user_id = p_user_id
    AND r.rest_date = p_rest_date
    AND r.rest_type = p_rest_type
    AND (p_exclude_id IS NULL OR r.id <> p_exclude_id)
  LIMIT 1;

  IF v_existing_name IS NOT NULL THEN
    RETURN '该员工在 ' || p_rest_date::text || ' 已有相同类型记录，存在排班冲突';
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: get_user_role("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."get_user_role"("uid" "uuid") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    'user'
  );
  RETURN NEW;
END;
$$;


--
-- Name: has_sop_manage_permission(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."has_sop_manage_permission"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_role     text;
  v_position text;
  v_perms    jsonb;
BEGIN
  SELECT role, position INTO v_role, v_position
  FROM profiles WHERE id = auth.uid();

  -- admin / super_admin 拥有全量权限
  IF v_role IN ('admin', 'super_admin') THEN
    RETURN true;
  END IF;

  IF v_position IS NULL THEN RETURN false; END IF;

  SELECT permissions INTO v_perms
  FROM positions WHERE name = v_position;

  RETURN COALESCE(v_perms, '[]'::jsonb) @> '["sop_manage"]'::jsonb;
END;
$$;


--
-- Name: increment_ingredient_usage("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."increment_ingredient_usage"("ingredient_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  UPDATE ingredients SET usage_count = usage_count + 1 WHERE id = ingredient_id;
$$;


--
-- Name: is_admin_or_above(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."is_admin_or_above"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$;


--
-- Name: update_dish_sop_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."update_dish_sop_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: update_dishes_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."update_dishes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: app_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" DEFAULT ''::"text" NOT NULL
);


--
-- Name: app_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."app_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "release_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'released'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: dish_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."dish_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: dish_sop; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."dish_sop" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dish_id" "uuid" NOT NULL,
    "ingredients" "text",
    "steps" "text",
    "plating" "text",
    "notes" "text",
    "version" "text" DEFAULT 'v1.0'::"text" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: dish_sop_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."dish_sop_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dish_id" "uuid" NOT NULL,
    "version" "text" NOT NULL,
    "ingredients" "text",
    "steps" "text",
    "plating" "text",
    "notes" "text",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: dishes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."dishes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT '其它'::"text" NOT NULL,
    "image_url" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dishes_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


--
-- Name: ingredient_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."ingredient_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 99 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: ingredient_subcategories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."ingredient_subcategories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: ingredient_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."ingredient_suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: ingredient_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."ingredient_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT '其它'::"text" NOT NULL,
    "unit" "text" DEFAULT '斤'::"text" NOT NULL,
    "supplier" "text" DEFAULT ''::"text" NOT NULL,
    "price" numeric(10,2),
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "usage_count" integer DEFAULT 0 NOT NULL,
    "subcategory_id" "uuid"
);


--
-- Name: no_rest_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."no_rest_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "order_id" "uuid",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "perf_id" "uuid",
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['approved'::"text", 'rejected'::"text", 'modified'::"text", 'submitted'::"text", 'system'::"text"])))
);


--
-- Name: COLUMN "notifications"."perf_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."notifications"."perf_id" IS '绩效记录ID，绩效类通知携带';


--
-- Name: operation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."operation_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operator_id" "uuid",
    "operator_name" "text",
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_name" "text",
    "detail" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity" numeric(10,2) NOT NULL,
    "original_quantity" numeric(10,2),
    "unit" "text" DEFAULT '斤'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "excluded_from_summary" boolean DEFAULT false NOT NULL,
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > (0)::numeric))
);


--
-- Name: perf_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."perf_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "linked_tag" "text",
    "tag_threshold" integer,
    "description" "text",
    CONSTRAINT "perf_templates_type_check" CHECK (("type" = ANY (ARRAY['add_item'::"text", 'deduct_item'::"text", 'remark'::"text"])))
);


--
-- Name: performance_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."performance_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "description" "text" NOT NULL,
    "score" numeric(6,1) NOT NULL,
    "operator_id" "uuid",
    "status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "image_url" "text",
    "remark" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "note" "text",
    CONSTRAINT "performance_scores_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


--
-- Name: COLUMN "performance_scores"."reviewed_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."performance_scores"."reviewed_at" IS '审核时间（approve/reject 时写入）';


--
-- Name: positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 99,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "permissions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "phone" "text",
    "display_name" "text",
    "role" "text" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "position" "text",
    "expo_push_token" "text",
    "earned_tags" "jsonb" DEFAULT '[]'::"jsonb",
    "account_id" "text"
);


--
-- Name: COLUMN "profiles"."account_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."profiles"."account_id" IS '人工账号编号，000 为超级管理员唯一标识';


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitter_id" "uuid" NOT NULL,
    "status" "public"."order_status" DEFAULT 'pending'::"public"."order_status" NOT NULL,
    "note" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: rest_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."rest_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rest_date" "date" NOT NULL,
    "rest_type" "text" NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "review_note" "text",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reminder_sent" boolean DEFAULT false NOT NULL,
    CONSTRAINT "rest_requests_rest_type_check" CHECK (("rest_type" = ANY (ARRAY['full'::"text", 'am'::"text", 'pm'::"text", 'late'::"text", 'early'::"text", 'absent'::"text", 'sick'::"text", 'personal'::"text", 'overtime'::"text"]))),
    CONSTRAINT "rest_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


--
-- Name: rest_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."rest_schedule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rest_date" "date" NOT NULL,
    "rest_type" "text" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rest_schedule_rest_type_check" CHECK (("rest_type" = ANY (ARRAY['full'::"text", 'am'::"text", 'pm'::"text", 'late'::"text", 'early'::"text", 'absent'::"text", 'sick'::"text", 'personal'::"text", 'overtime'::"text"])))
);


--
-- Name: summary_quantity_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."summary_quantity_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "override_quantity" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."user_push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" DEFAULT 'expo'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: watermark_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."watermark_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photo_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_id" "uuid",
    "reply_to_user_id" "uuid",
    "reply_to_name" "text",
    "post_id" "uuid",
    CONSTRAINT "watermark_comments_content_check" CHECK ((("char_length"("content") >= 1) AND ("char_length"("content") <= 500)))
);


--
-- Name: watermark_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."watermark_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photo_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "post_id" "uuid"
);


--
-- Name: watermark_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."watermark_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "photo_url" "text" NOT NULL,
    "photo_path" "text" NOT NULL,
    "remark" "text" DEFAULT ''::"text",
    "taken_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "media_type" "text" DEFAULT 'image'::"text" NOT NULL,
    CONSTRAINT "watermark_photos_media_type_check" CHECK (("media_type" = ANY (ARRAY['image'::"text", 'video'::"text"])))
);


--
-- Name: watermark_post_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."watermark_post_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "photo_url" "text" NOT NULL,
    "photo_path" "text",
    "media_type" "text" DEFAULT 'image'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "watermark_post_media_media_type_check" CHECK (("media_type" = ANY (ARRAY['image'::"text", 'video'::"text"])))
);


--
-- Name: watermark_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."watermark_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "remark" "text",
    "taken_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: app_config app_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'app_config_key_key'
      AND n.nspname = 'public'
      AND c.relname = 'app_config'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_key_key" UNIQUE ("key");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'app_config_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'app_config'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: app_versions app_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'app_versions_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'app_versions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_categories dish_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'dish_categories_name_key'
      AND n.nspname = 'public'
      AND c.relname = 'dish_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."dish_categories"
    ADD CONSTRAINT "dish_categories_name_key" UNIQUE ("name");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_categories dish_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'dish_categories_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'dish_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."dish_categories"
    ADD CONSTRAINT "dish_categories_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_sop_history dish_sop_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'dish_sop_history_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'dish_sop_history'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."dish_sop_history"
    ADD CONSTRAINT "dish_sop_history_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_sop dish_sop_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'dish_sop_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'dish_sop'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."dish_sop"
    ADD CONSTRAINT "dish_sop_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dishes dishes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'dishes_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'dishes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."dishes"
    ADD CONSTRAINT "dishes_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_categories ingredient_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'ingredient_categories_name_key'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."ingredient_categories"
    ADD CONSTRAINT "ingredient_categories_name_key" UNIQUE ("name");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_categories ingredient_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'ingredient_categories_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."ingredient_categories"
    ADD CONSTRAINT "ingredient_categories_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_subcategories ingredient_subcategories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'ingredient_subcategories_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_subcategories'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."ingredient_subcategories"
    ADD CONSTRAINT "ingredient_subcategories_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_suppliers ingredient_suppliers_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'ingredient_suppliers_name_key'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_suppliers'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."ingredient_suppliers"
    ADD CONSTRAINT "ingredient_suppliers_name_key" UNIQUE ("name");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_suppliers ingredient_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'ingredient_suppliers_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_suppliers'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."ingredient_suppliers"
    ADD CONSTRAINT "ingredient_suppliers_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_units ingredient_units_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'ingredient_units_name_key'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_units'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."ingredient_units"
    ADD CONSTRAINT "ingredient_units_name_key" UNIQUE ("name");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_units ingredient_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'ingredient_units_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_units'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."ingredient_units"
    ADD CONSTRAINT "ingredient_units_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredients ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'ingredients_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'ingredients'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: no_rest_days no_rest_days_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'no_rest_days_date_key'
      AND n.nspname = 'public'
      AND c.relname = 'no_rest_days'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."no_rest_days"
    ADD CONSTRAINT "no_rest_days_date_key" UNIQUE ("date");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: no_rest_days no_rest_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'no_rest_days_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'no_rest_days'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."no_rest_days"
    ADD CONSTRAINT "no_rest_days_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'notifications_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'notifications'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: operation_logs operation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'operation_logs_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'operation_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."operation_logs"
    ADD CONSTRAINT "operation_logs_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'order_items_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'order_items'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: perf_templates perf_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'perf_templates_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'perf_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."perf_templates"
    ADD CONSTRAINT "perf_templates_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: performance_scores performance_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'performance_scores_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'performance_scores'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."performance_scores"
    ADD CONSTRAINT "performance_scores_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: positions positions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'positions_name_key'
      AND n.nspname = 'public'
      AND c.relname = 'positions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_name_key" UNIQUE ("name");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: positions positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'positions_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'positions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_account_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_account_id_key" UNIQUE ("account_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'purchase_orders_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'purchase_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_requests rest_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rest_requests_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'rest_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rest_requests"
    ADD CONSTRAINT "rest_requests_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_schedule rest_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rest_schedule_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'rest_schedule'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rest_schedule"
    ADD CONSTRAINT "rest_schedule_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: summary_quantity_overrides summary_quantity_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'summary_quantity_overrides_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'summary_quantity_overrides'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."summary_quantity_overrides"
    ADD CONSTRAINT "summary_quantity_overrides_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_push_tokens user_push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_push_tokens_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_push_tokens'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_push_tokens"
    ADD CONSTRAINT "user_push_tokens_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_push_tokens user_push_tokens_user_id_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_push_tokens_user_id_token_key'
      AND n.nspname = 'public'
      AND c.relname = 'user_push_tokens'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_push_tokens"
    ADD CONSTRAINT "user_push_tokens_user_id_token_key" UNIQUE ("user_id", "token");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_comments watermark_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_comments_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_comments"
    ADD CONSTRAINT "watermark_comments_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_likes watermark_likes_photo_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_likes_photo_id_user_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_likes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_likes"
    ADD CONSTRAINT "watermark_likes_photo_id_user_id_key" UNIQUE ("photo_id", "user_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_likes watermark_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_likes_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_likes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_likes"
    ADD CONSTRAINT "watermark_likes_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_photos watermark_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_photos_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_photos'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_photos"
    ADD CONSTRAINT "watermark_photos_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_post_media watermark_post_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_post_media_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_post_media'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_post_media"
    ADD CONSTRAINT "watermark_post_media_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_posts watermark_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_posts_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_posts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_posts"
    ADD CONSTRAINT "watermark_posts_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: idx_app_versions_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "idx_app_versions_version" ON "public"."app_versions" USING "btree" ("version");


--
-- Name: idx_comments_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_comments_parent" ON "public"."watermark_comments" USING "btree" ("parent_id");


--
-- Name: idx_comments_photo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_comments_photo" ON "public"."watermark_comments" USING "btree" ("photo_id");


--
-- Name: idx_comments_photo_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_comments_photo_created" ON "public"."watermark_comments" USING "btree" ("photo_id", "created_at");


--
-- Name: idx_dish_sop_history_dish; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_dish_sop_history_dish" ON "public"."dish_sop_history" USING "btree" ("dish_id", "created_at" DESC);


--
-- Name: idx_likes_photo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_likes_photo" ON "public"."watermark_likes" USING "btree" ("photo_id");


--
-- Name: idx_likes_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_likes_post" ON "public"."watermark_likes" USING "btree" ("post_id");


--
-- Name: idx_media_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_media_post" ON "public"."watermark_post_media" USING "btree" ("post_id", "sort_order");


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");


--
-- Name: idx_operation_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_operation_logs_created_at" ON "public"."operation_logs" USING "btree" ("created_at" DESC);


--
-- Name: idx_operation_logs_operator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_operation_logs_operator" ON "public"."operation_logs" USING "btree" ("operator_id");


--
-- Name: idx_operation_logs_purchase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_operation_logs_purchase" ON "public"."operation_logs" USING "btree" ("target_type", "created_at" DESC) WHERE ("target_type" = 'purchase'::"text");


--
-- Name: idx_posts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_posts_user" ON "public"."watermark_posts" USING "btree" ("user_id", "taken_at" DESC);


--
-- Name: idx_ps_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_ps_status" ON "public"."performance_scores" USING "btree" ("status");


--
-- Name: idx_ps_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_ps_user_date" ON "public"."performance_scores" USING "btree" ("user_id", "date" DESC);


--
-- Name: idx_push_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_push_tokens_user" ON "public"."user_push_tokens" USING "btree" ("user_id");


--
-- Name: idx_sqo_ingredient_range; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "idx_sqo_ingredient_range" ON "public"."summary_quantity_overrides" USING "btree" ("ingredient_id", COALESCE("start_date", '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE("end_date", '9999-12-31 00:00:00+00'::timestamp with time zone));


--
-- Name: idx_watermark_comments_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "idx_watermark_comments_post_id" ON "public"."watermark_comments" USING "btree" ("post_id");


--
-- Name: no_rest_days_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "no_rest_days_date_idx" ON "public"."no_rest_days" USING "btree" ("date");


--
-- Name: rest_schedule_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "rest_schedule_date_idx" ON "public"."rest_schedule" USING "btree" ("rest_date");


--
-- Name: rest_schedule_user_date_type_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "rest_schedule_user_date_type_uniq" ON "public"."rest_schedule" USING "btree" ("user_id", "rest_date", "rest_type");


--
-- Name: rest_schedule_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "rest_schedule_user_idx" ON "public"."rest_schedule" USING "btree" ("user_id");


--
-- Name: watermark_photos_taken_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "watermark_photos_taken_at_idx" ON "public"."watermark_photos" USING "btree" ("taken_at" DESC);


--
-- Name: watermark_photos_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "watermark_photos_user_id_idx" ON "public"."watermark_photos" USING "btree" ("user_id");


--
-- Name: purchase_orders purchase_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "purchase_orders_updated_at" BEFORE UPDATE ON "public"."purchase_orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();


--
-- Name: dish_sop trg_dish_sop_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_dish_sop_updated_at" BEFORE UPDATE ON "public"."dish_sop" FOR EACH ROW EXECUTE FUNCTION "public"."update_dish_sop_updated_at"();


--
-- Name: dishes trg_dishes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "trg_dishes_updated_at" BEFORE UPDATE ON "public"."dishes" FOR EACH ROW EXECUTE FUNCTION "public"."update_dishes_updated_at"();


--
-- Name: dish_categories dish_categories_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'dish_categories_created_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'dish_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."dish_categories"
    ADD CONSTRAINT "dish_categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_sop dish_sop_dish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'dish_sop_dish_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'dish_sop'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."dish_sop"
    ADD CONSTRAINT "dish_sop_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_sop_history dish_sop_history_dish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'dish_sop_history_dish_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'dish_sop_history'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."dish_sop_history"
    ADD CONSTRAINT "dish_sop_history_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_sop_history dish_sop_history_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'dish_sop_history_updated_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'dish_sop_history'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."dish_sop_history"
    ADD CONSTRAINT "dish_sop_history_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_sop dish_sop_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'dish_sop_updated_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'dish_sop'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."dish_sop"
    ADD CONSTRAINT "dish_sop_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dishes dishes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'dishes_created_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'dishes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."dishes"
    ADD CONSTRAINT "dishes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_subcategories ingredient_subcategories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'ingredient_subcategories_category_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_subcategories'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."ingredient_subcategories"
    ADD CONSTRAINT "ingredient_subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."ingredient_categories"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredients ingredients_subcategory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'ingredients_subcategory_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'ingredients'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "public"."ingredient_subcategories"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notifications notifications_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'notifications_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'notifications'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'notifications_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'notifications'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: operation_logs operation_logs_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'operation_logs_operator_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'operation_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."operation_logs"
    ADD CONSTRAINT "operation_logs_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_items order_items_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'order_items_ingredient_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'order_items'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'order_items_order_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'order_items'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: performance_scores performance_scores_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'performance_scores_operator_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'performance_scores'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."performance_scores"
    ADD CONSTRAINT "performance_scores_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: performance_scores performance_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'performance_scores_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'performance_scores'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."performance_scores"
    ADD CONSTRAINT "performance_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: purchase_orders purchase_orders_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'purchase_orders_reviewed_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'purchase_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: purchase_orders purchase_orders_submitter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'purchase_orders_submitter_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'purchase_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_requests rest_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rest_requests_reviewed_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'rest_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rest_requests"
    ADD CONSTRAINT "rest_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_requests rest_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rest_requests_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'rest_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rest_requests"
    ADD CONSTRAINT "rest_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_schedule rest_schedule_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'rest_schedule_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'rest_schedule'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."rest_schedule"
    ADD CONSTRAINT "rest_schedule_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: summary_quantity_overrides summary_quantity_overrides_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'summary_quantity_overrides_ingredient_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'summary_quantity_overrides'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."summary_quantity_overrides"
    ADD CONSTRAINT "summary_quantity_overrides_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_push_tokens user_push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'user_push_tokens_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'user_push_tokens'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."user_push_tokens"
    ADD CONSTRAINT "user_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_comments watermark_comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_comments_parent_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_comments"
    ADD CONSTRAINT "watermark_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."watermark_comments"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_comments watermark_comments_photo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_comments_photo_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_comments"
    ADD CONSTRAINT "watermark_comments_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "public"."watermark_photos"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_comments watermark_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_comments_post_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_comments"
    ADD CONSTRAINT "watermark_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."watermark_posts"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_comments watermark_comments_reply_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_comments_reply_to_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_comments"
    ADD CONSTRAINT "watermark_comments_reply_to_user_id_fkey" FOREIGN KEY ("reply_to_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_comments watermark_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_comments_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_comments"
    ADD CONSTRAINT "watermark_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_likes watermark_likes_photo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_likes_photo_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_likes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_likes"
    ADD CONSTRAINT "watermark_likes_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "public"."watermark_photos"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_likes watermark_likes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_likes_post_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_likes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_likes"
    ADD CONSTRAINT "watermark_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."watermark_posts"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_likes watermark_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_likes_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_likes'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_likes"
    ADD CONSTRAINT "watermark_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_photos watermark_photos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_photos_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_photos'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_photos"
    ADD CONSTRAINT "watermark_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_post_media watermark_post_media_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_post_media_post_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_post_media'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_post_media"
    ADD CONSTRAINT "watermark_post_media_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."watermark_posts"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_posts watermark_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'watermark_posts_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_posts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."watermark_posts"
    ADD CONSTRAINT "watermark_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: summary_quantity_overrides admin can manage overrides; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin can manage overrides'
      AND n.nspname = 'public'
      AND c.relname = 'summary_quantity_overrides'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin can manage overrides" ON "public"."summary_quantity_overrides" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_categories admin_write_categories; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_write_categories'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_write_categories" ON "public"."ingredient_categories" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_suppliers admin_write_suppliers; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'admin_write_suppliers'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_suppliers'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "admin_write_suppliers" ON "public"."ingredient_suppliers" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: summary_quantity_overrides all authenticated can read overrides; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'all authenticated can read overrides'
      AND n.nspname = 'public'
      AND c.relname = 'summary_quantity_overrides'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "all authenticated can read overrides" ON "public"."summary_quantity_overrides" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_schedule all read rest_schedule; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'all read rest_schedule'
      AND n.nspname = 'public'
      AND c.relname = 'rest_schedule'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "all read rest_schedule" ON "public"."rest_schedule" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: app_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."app_versions" ENABLE ROW LEVEL SECURITY;

--
-- Name: ingredient_units authenticated can delete units; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated can delete units'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_units'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated can delete units" ON "public"."ingredient_units" FOR DELETE TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: operation_logs authenticated can insert logs; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated can insert logs'
      AND n.nspname = 'public'
      AND c.relname = 'operation_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated can insert logs" ON "public"."operation_logs" FOR INSERT TO "authenticated" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_units authenticated can insert units; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated can insert units'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_units'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated can insert units" ON "public"."ingredient_units" FOR INSERT TO "authenticated" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_units authenticated can read units; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated can read units'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_units'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated can read units" ON "public"."ingredient_units" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: no_rest_days authenticated delete no_rest_days; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated delete no_rest_days'
      AND n.nspname = 'public'
      AND c.relname = 'no_rest_days'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated delete no_rest_days" ON "public"."no_rest_days" FOR DELETE TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_schedule authenticated delete rest_schedule; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated delete rest_schedule'
      AND n.nspname = 'public'
      AND c.relname = 'rest_schedule'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated delete rest_schedule" ON "public"."rest_schedule" FOR DELETE TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: no_rest_days authenticated insert no_rest_days; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated insert no_rest_days'
      AND n.nspname = 'public'
      AND c.relname = 'no_rest_days'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated insert no_rest_days" ON "public"."no_rest_days" FOR INSERT TO "authenticated" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_schedule authenticated insert rest_schedule; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated insert rest_schedule'
      AND n.nspname = 'public'
      AND c.relname = 'rest_schedule'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated insert rest_schedule" ON "public"."rest_schedule" FOR INSERT TO "authenticated" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: app_config authenticated read app_config; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated read app_config'
      AND n.nspname = 'public'
      AND c.relname = 'app_config'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated read app_config" ON "public"."app_config" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: no_rest_days authenticated read no_rest_days; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated read no_rest_days'
      AND n.nspname = 'public'
      AND c.relname = 'no_rest_days'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated read no_rest_days" ON "public"."no_rest_days" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: positions authenticated read positions; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated read positions'
      AND n.nspname = 'public'
      AND c.relname = 'positions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated read positions" ON "public"."positions" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_schedule authenticated read rest_schedule; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated read rest_schedule'
      AND n.nspname = 'public'
      AND c.relname = 'rest_schedule'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated read rest_schedule" ON "public"."rest_schedule" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: perf_templates authenticated read templates; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated read templates'
      AND n.nspname = 'public'
      AND c.relname = 'perf_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated read templates" ON "public"."perf_templates" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: app_config authenticated update app_config; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated update app_config'
      AND n.nspname = 'public'
      AND c.relname = 'app_config'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated update app_config" ON "public"."app_config" FOR UPDATE TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_schedule authenticated update rest_schedule; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated update rest_schedule'
      AND n.nspname = 'public'
      AND c.relname = 'rest_schedule'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated update rest_schedule" ON "public"."rest_schedule" FOR UPDATE TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles authenticated users select all profiles; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated users select all profiles'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated users select all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_subcategories authenticated_crud_subcategories; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated_crud_subcategories'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_subcategories'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated_crud_subcategories" ON "public"."ingredient_subcategories" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_photos authenticated_delete_own_watermark_photos; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated_delete_own_watermark_photos'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_photos'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated_delete_own_watermark_photos" ON "public"."watermark_photos" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_photos authenticated_insert_own_watermark_photos; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated_insert_own_watermark_photos'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_photos'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated_insert_own_watermark_photos" ON "public"."watermark_photos" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_categories authenticated_read_categories; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated_read_categories'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated_read_categories" ON "public"."ingredient_categories" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_suppliers authenticated_read_suppliers; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated_read_suppliers'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_suppliers'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated_read_suppliers" ON "public"."ingredient_suppliers" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_photos authenticated_select_watermark_photos; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated_select_watermark_photos'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_photos'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "authenticated_select_watermark_photos" ON "public"."watermark_photos" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_comments comments_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'comments_delete'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "comments_delete" ON "public"."watermark_comments" FOR DELETE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_comments comments_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'comments_insert'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "comments_insert" ON "public"."watermark_comments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_comments comments_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'comments_select'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_comments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "comments_select" ON "public"."watermark_comments" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."dish_categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: dish_categories dish_categories_delete_manage; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dish_categories_delete_manage'
      AND n.nspname = 'public'
      AND c.relname = 'dish_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "dish_categories_delete_manage" ON "public"."dish_categories" FOR DELETE TO "authenticated" USING ("public"."has_sop_manage_permission"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_categories dish_categories_insert_manage; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dish_categories_insert_manage'
      AND n.nspname = 'public'
      AND c.relname = 'dish_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "dish_categories_insert_manage" ON "public"."dish_categories" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_sop_manage_permission"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_categories dish_categories_select_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dish_categories_select_all'
      AND n.nspname = 'public'
      AND c.relname = 'dish_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "dish_categories_select_all" ON "public"."dish_categories" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_categories dish_categories_update_manage; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dish_categories_update_manage'
      AND n.nspname = 'public'
      AND c.relname = 'dish_categories'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "dish_categories_update_manage" ON "public"."dish_categories" FOR UPDATE TO "authenticated" USING ("public"."has_sop_manage_permission"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_sop; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."dish_sop" ENABLE ROW LEVEL SECURITY;

--
-- Name: dish_sop dish_sop_delete_manage; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dish_sop_delete_manage'
      AND n.nspname = 'public'
      AND c.relname = 'dish_sop'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "dish_sop_delete_manage" ON "public"."dish_sop" FOR DELETE TO "authenticated" USING ("public"."has_sop_manage_permission"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_sop_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."dish_sop_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: dish_sop dish_sop_insert_manage; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dish_sop_insert_manage'
      AND n.nspname = 'public'
      AND c.relname = 'dish_sop'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "dish_sop_insert_manage" ON "public"."dish_sop" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_sop_manage_permission"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_sop dish_sop_select_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dish_sop_select_all'
      AND n.nspname = 'public'
      AND c.relname = 'dish_sop'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "dish_sop_select_all" ON "public"."dish_sop" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_sop dish_sop_update_manage; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dish_sop_update_manage'
      AND n.nspname = 'public'
      AND c.relname = 'dish_sop'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "dish_sop_update_manage" ON "public"."dish_sop" FOR UPDATE TO "authenticated" USING ("public"."has_sop_manage_permission"()) WITH CHECK ("public"."has_sop_manage_permission"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dishes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."dishes" ENABLE ROW LEVEL SECURITY;

--
-- Name: dishes dishes_delete_manage; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dishes_delete_manage'
      AND n.nspname = 'public'
      AND c.relname = 'dishes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "dishes_delete_manage" ON "public"."dishes" FOR DELETE TO "authenticated" USING ("public"."has_sop_manage_permission"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dishes dishes_insert_manage; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dishes_insert_manage'
      AND n.nspname = 'public'
      AND c.relname = 'dishes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "dishes_insert_manage" ON "public"."dishes" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_sop_manage_permission"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dishes dishes_select_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dishes_select_all'
      AND n.nspname = 'public'
      AND c.relname = 'dishes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "dishes_select_all" ON "public"."dishes" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dishes dishes_update_manage; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dishes_update_manage'
      AND n.nspname = 'public'
      AND c.relname = 'dishes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "dishes_update_manage" ON "public"."dishes" FOR UPDATE TO "authenticated" USING ("public"."has_sop_manage_permission"()) WITH CHECK ("public"."has_sop_manage_permission"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ingredient_categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: ingredient_subcategories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ingredient_subcategories" ENABLE ROW LEVEL SECURITY;

--
-- Name: ingredient_suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ingredient_suppliers" ENABLE ROW LEVEL SECURITY;

--
-- Name: ingredient_units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ingredient_units" ENABLE ROW LEVEL SECURITY;

--
-- Name: ingredients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;

--
-- Name: watermark_likes likes_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'likes_delete'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_likes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "likes_delete" ON "public"."watermark_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_likes likes_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'likes_insert'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_likes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "likes_insert" ON "public"."watermark_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_likes likes_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'likes_select'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_likes'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "likes_select" ON "public"."watermark_likes" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_post_media media_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'media_delete'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_post_media'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "media_delete" ON "public"."watermark_post_media" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."watermark_posts"
  WHERE (("watermark_posts"."id" = "watermark_post_media"."post_id") AND ("watermark_posts"."user_id" = "auth"."uid"())))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_post_media media_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'media_insert'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_post_media'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "media_insert" ON "public"."watermark_post_media" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."watermark_posts"
  WHERE (("watermark_posts"."id" = "watermark_post_media"."post_id") AND ("watermark_posts"."user_id" = "auth"."uid"())))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_post_media media_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'media_select'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_post_media'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "media_select" ON "public"."watermark_post_media" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: no_rest_days; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."no_rest_days" ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: operation_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."operation_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: perf_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."perf_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: performance_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."performance_scores" ENABLE ROW LEVEL SECURITY;

--
-- Name: positions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."positions" ENABLE ROW LEVEL SECURITY;

--
-- Name: watermark_posts posts_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'posts_delete'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_posts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "posts_delete" ON "public"."watermark_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_posts posts_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'posts_insert'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_posts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "posts_insert" ON "public"."watermark_posts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_posts posts_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'posts_select'
      AND n.nspname = 'public'
      AND c.relname = 'watermark_posts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "posts_select" ON "public"."watermark_posts" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: performance_scores ps_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ps_delete'
      AND n.nspname = 'public'
      AND c.relname = 'performance_scores'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "ps_delete" ON "public"."performance_scores" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'chef'::"text"]))))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: performance_scores ps_insert_manager; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ps_insert_manager'
      AND n.nspname = 'public'
      AND c.relname = 'performance_scores'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "ps_insert_manager" ON "public"."performance_scores" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'chef'::"text"]))))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: performance_scores ps_insert_staff; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ps_insert_staff'
      AND n.nspname = 'public'
      AND c.relname = 'performance_scores'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "ps_insert_staff" ON "public"."performance_scores" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("status" = 'pending'::"text") AND ("operator_id" IS NULL)));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: performance_scores ps_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ps_select'
      AND n.nspname = 'public'
      AND c.relname = 'performance_scores'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "ps_select" ON "public"."performance_scores" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'chef'::"text"])))))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: performance_scores ps_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'ps_update'
      AND n.nspname = 'public'
      AND c.relname = 'performance_scores'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "ps_update" ON "public"."performance_scores" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'chef'::"text"]))))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: app_versions public_read_versions; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'public_read_versions'
      AND n.nspname = 'public'
      AND c.relname = 'app_versions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "public_read_versions" ON "public"."app_versions" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredient_subcategories public_select_subcategories; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'public_select_subcategories'
      AND n.nspname = 'public'
      AND c.relname = 'ingredient_subcategories'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "public_select_subcategories" ON "public"."ingredient_subcategories" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: rest_schedule rest_managers manage rest_schedule; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'rest_managers manage rest_schedule'
      AND n.nspname = 'public'
      AND c.relname = 'rest_schedule'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "rest_managers manage rest_schedule" ON "public"."rest_schedule" TO "authenticated" USING ("public"."can_manage_rest"()) WITH CHECK ("public"."can_manage_rest"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_requests rest_managers select all requests; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'rest_managers select all requests'
      AND n.nspname = 'public'
      AND c.relname = 'rest_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "rest_managers select all requests" ON "public"."rest_requests" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_manage_rest"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_requests rest_managers update requests; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'rest_managers update requests'
      AND n.nspname = 'public'
      AND c.relname = 'rest_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "rest_managers update requests" ON "public"."rest_requests" FOR UPDATE TO "authenticated" USING ("public"."can_manage_rest"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."rest_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: rest_schedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."rest_schedule" ENABLE ROW LEVEL SECURITY;

--
-- Name: dish_sop_history sop_history_delete_manage; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'sop_history_delete_manage'
      AND n.nspname = 'public'
      AND c.relname = 'dish_sop_history'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "sop_history_delete_manage" ON "public"."dish_sop_history" FOR DELETE TO "authenticated" USING ("public"."has_sop_manage_permission"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_sop_history sop_history_insert_manage; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'sop_history_insert_manage'
      AND n.nspname = 'public'
      AND c.relname = 'dish_sop_history'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "sop_history_insert_manage" ON "public"."dish_sop_history" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_sop_manage_permission"());
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: dish_sop_history sop_history_select_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'sop_history_select_all'
      AND n.nspname = 'public'
      AND c.relname = 'dish_sop_history'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "sop_history_select_all" ON "public"."dish_sop_history" FOR SELECT TO "authenticated" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: summary_quantity_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."summary_quantity_overrides" ENABLE ROW LEVEL SECURITY;

--
-- Name: operation_logs super_admin can read logs; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'super_admin can read logs'
      AND n.nspname = 'public'
      AND c.relname = 'operation_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "super_admin can read logs" ON "public"."operation_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: positions super_admin manage positions; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'super_admin manage positions'
      AND n.nspname = 'public'
      AND c.relname = 'positions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "super_admin manage positions" ON "public"."positions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: positions super_admin update positions; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'super_admin update positions'
      AND n.nspname = 'public'
      AND c.relname = 'positions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "super_admin update positions" ON "public"."positions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: app_versions super_admin_write_versions; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'super_admin_write_versions'
      AND n.nspname = 'public'
      AND c.relname = 'app_versions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "super_admin_write_versions" ON "public"."app_versions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_push_tokens tokens_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'tokens_delete'
      AND n.nspname = 'public'
      AND c.relname = 'user_push_tokens'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "tokens_delete" ON "public"."user_push_tokens" FOR DELETE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_push_tokens tokens_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'tokens_select'
      AND n.nspname = 'public'
      AND c.relname = 'user_push_tokens'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "tokens_select" ON "public"."user_push_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_push_tokens tokens_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'tokens_update'
      AND n.nspname = 'public'
      AND c.relname = 'user_push_tokens'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "tokens_update" ON "public"."user_push_tokens" FOR UPDATE USING (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_push_tokens tokens_upsert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'tokens_upsert'
      AND n.nspname = 'public'
      AND c.relname = 'user_push_tokens'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "tokens_upsert" ON "public"."user_push_tokens" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_push_tokens" ENABLE ROW LEVEL SECURITY;

--
-- Name: rest_requests users delete own pending; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'users delete own pending'
      AND n.nspname = 'public'
      AND c.relname = 'rest_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "users delete own pending" ON "public"."rest_requests" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("status" = 'pending'::"text")));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_requests users insert own requests; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'users insert own requests'
      AND n.nspname = 'public'
      AND c.relname = 'rest_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "users insert own requests" ON "public"."rest_requests" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: rest_requests users select own requests; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'users select own requests'
      AND n.nspname = 'public'
      AND c.relname = 'rest_requests'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "users select own requests" ON "public"."rest_requests" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: app_versions versions_read_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'versions_read_all'
      AND n.nspname = 'public'
      AND c.relname = 'app_versions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "versions_read_all" ON "public"."app_versions" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: app_versions versions_write_admin; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'versions_write_admin'
      AND n.nspname = 'public'
      AND c.relname = 'app_versions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "versions_write_admin" ON "public"."app_versions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: watermark_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."watermark_comments" ENABLE ROW LEVEL SECURITY;

--
-- Name: watermark_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."watermark_likes" ENABLE ROW LEVEL SECURITY;

--
-- Name: watermark_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."watermark_photos" ENABLE ROW LEVEL SECURITY;

--
-- Name: watermark_post_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."watermark_post_media" ENABLE ROW LEVEL SECURITY;

--
-- Name: watermark_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."watermark_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: ingredients 已登录用户查看食材; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '已登录用户查看食材'
      AND n.nspname = 'public'
      AND c.relname = 'ingredients'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "已登录用户查看食材" ON "public"."ingredients" FOR SELECT TO "authenticated" USING (("is_active" = true));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: purchase_orders 用户创建申购单; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户创建申购单'
      AND n.nspname = 'public'
      AND c.relname = 'purchase_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户创建申购单" ON "public"."purchase_orders" FOR INSERT TO "authenticated" WITH CHECK (("submitter_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_items 用户创建申购单明细; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户创建申购单明细'
      AND n.nspname = 'public'
      AND c.relname = 'order_items'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户创建申购单明细" ON "public"."order_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."purchase_orders" "po"
  WHERE (("po"."id" = "order_items"."order_id") AND ("po"."submitter_id" = "auth"."uid"())))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notifications 用户可查看自己的通知; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户可查看自己的通知'
      AND n.nspname = 'public'
      AND c.relname = 'notifications'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户可查看自己的通知" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notifications 用户可标记自己的通知已读; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户可标记自己的通知已读'
      AND n.nspname = 'public'
      AND c.relname = 'notifications'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户可标记自己的通知已读" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles 用户更新自己的profile（不能改角色）; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户更新自己的profile（不能改角色）'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户更新自己的profile（不能改角色）" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK ((NOT ("role" IS DISTINCT FROM "public"."get_user_role"("auth"."uid"()))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_items 用户查看申购单明细; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户查看申购单明细'
      AND n.nspname = 'public'
      AND c.relname = 'order_items'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户查看申购单明细" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."purchase_orders" "po"
  WHERE (("po"."id" = "order_items"."order_id") AND (("po"."submitter_id" = "auth"."uid"()) OR ("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles 用户查看自己的profile; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户查看自己的profile'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户查看自己的profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: purchase_orders 用户查看自己的申购单; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用户查看自己的申购单'
      AND n.nspname = 'public'
      AND c.relname = 'purchase_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用户查看自己的申购单" ON "public"."purchase_orders" FOR SELECT TO "authenticated" USING ((("submitter_id" = "auth"."uid"()) OR ("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles 管理员完全访问profiles; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '管理员完全访问profiles'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "管理员完全访问profiles" ON "public"."profiles" TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))) WITH CHECK (("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: purchase_orders 管理员更新申购单; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '管理员更新申购单'
      AND n.nspname = 'public'
      AND c.relname = 'purchase_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "管理员更新申购单" ON "public"."purchase_orders" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: order_items 管理员更新申购单明细; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '管理员更新申购单明细'
      AND n.nspname = 'public'
      AND c.relname = 'order_items'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "管理员更新申购单明细" ON "public"."order_items" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ingredients 管理员管理食材; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '管理员管理食材'
      AND n.nspname = 'public'
      AND c.relname = 'ingredients'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "管理员管理食材" ON "public"."ingredients" TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))) WITH CHECK (("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notifications 认证用户可插入通知; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '认证用户可插入通知'
      AND n.nspname = 'public'
      AND c.relname = 'notifications'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "认证用户可插入通知" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- PostgreSQL database dump complete
--




-- ============================================================
-- SECTION: DIFF FILTER OBJECTS
-- ============================================================
-- Objects that match diff-filter.json but cannot be represented
-- precisely by pg_dump --filter.

-- auth.users trigger: on_auth_user_created
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND t.tgname = 'on_auth_user_created'
      AND n.nspname = 'auth'
      AND c.relname = 'users'
  ) THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();';
  END IF;
END
$pg_schema_restore$;
-- policy: "authenticated upload performance images" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'authenticated upload performance images'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated upload performance images" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = ''performance-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: "public read performance images" on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'public read performance images'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "public read performance images" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''performance-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: dish_images_delete on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dish_images_delete'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY dish_images_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = ''dish-images''::text) AND public.has_sop_manage_permission()));';
  END IF;
END
$pg_schema_restore$;
-- policy: dish_images_insert on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dish_images_insert'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY dish_images_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = ''dish-images''::text) AND public.has_sop_manage_permission()));';
  END IF;
END
$pg_schema_restore$;
-- policy: dish_images_select on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dish_images_select'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY dish_images_select ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''dish-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: dish_images_update on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'dish_images_update'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY dish_images_update ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = ''dish-images''::text) AND public.has_sop_manage_permission()));';
  END IF;
END
$pg_schema_restore$;
-- policy: perf_img_insert on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'perf_img_insert'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY perf_img_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = ''performance-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: perf_img_select on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'perf_img_select'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY perf_img_select ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''performance-images''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: watermark_photos_delete on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'watermark_photos_delete'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY watermark_photos_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING ((bucket_id = ''watermark-photos''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: watermark_photos_insert on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'watermark_photos_insert'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY watermark_photos_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = ''watermark-photos''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: watermark_photos_select on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'watermark_photos_select'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY watermark_photos_select ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = ''watermark-photos''::text));';
  END IF;
END
$pg_schema_restore$;

-- ============================================================
-- SECTION: STORAGE BUCKETS DATA
-- ============================================================

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('dish-images', 'dish-images', NULL, '2026-07-02 02:00:49.26026+00', '2026-07-02 02:00:49.26026+00', 'true', 'false', '5242880', '{image/jpeg,image/png,image/webp,image/gif}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('performance-images', 'performance-images', NULL, '2026-05-29 01:44:28.883073+00', '2026-05-29 01:44:28.883073+00', 'true', 'false', '1048576', '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('watermark-photos', 'watermark-photos', NULL, '2026-07-02 14:18:47.440666+00', '2026-07-02 14:18:47.440666+00', 'true', 'false', NULL, NULL, NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";
