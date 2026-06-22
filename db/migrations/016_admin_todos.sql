-- Internal ops todo list for Pump admin console (not user-facing missions).

CREATE TABLE IF NOT EXISTS admin_todos (
    id bigint NOT NULL,
    title text NOT NULL,
    body text,
    priority text NOT NULL DEFAULT 'medium',
    is_completed boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_by text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT admin_todos_pkey PRIMARY KEY (id),
    CONSTRAINT admin_todos_title_check CHECK (btrim(title) <> ''),
    CONSTRAINT admin_todos_priority_check CHECK (
        priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])
    ),
    CONSTRAINT admin_todos_created_by_check CHECK (
        created_by IS NULL OR created_by = lower(created_by)
    )
);

CREATE SEQUENCE IF NOT EXISTS admin_todos_id_seq
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER SEQUENCE admin_todos_id_seq OWNED BY admin_todos.id;
ALTER TABLE admin_todos ALTER COLUMN id SET DEFAULT nextval('admin_todos_id_seq'::regclass);

CREATE INDEX IF NOT EXISTS idx_admin_todos_open_sort
    ON admin_todos (is_completed, sort_order, id);
