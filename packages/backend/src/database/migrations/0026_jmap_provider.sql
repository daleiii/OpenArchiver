DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'jmap' AND enumtypid = 'public.ingestion_provider'::regtype) THEN
        ALTER TYPE "public"."ingestion_provider" ADD VALUE 'jmap';
    END IF;
END $$;
