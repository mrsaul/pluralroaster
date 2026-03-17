CREATE TABLE public.sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  synced_count INTEGER NOT NULL DEFAULT 0,
  parse_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sync_runs_source_type_completed_at
  ON public.sync_runs (source, sync_type, completed_at DESC);

CREATE TRIGGER update_sync_runs_updated_at
BEFORE UPDATE ON public.sync_runs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins can read sync runs"
ON public.sync_runs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert sync runs"
ON public.sync_runs
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update sync runs"
ON public.sync_runs
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete sync runs"
ON public.sync_runs
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));