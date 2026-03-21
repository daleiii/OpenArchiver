DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'gmail' AND enumtypid = 'public.ingestion_provider'::regtype) THEN
        ALTER TYPE "public"."ingestion_provider" ADD VALUE 'gmail';
    END IF;
END $$;