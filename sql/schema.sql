-- Rental Motor Maintenance & Inventory System v8
-- Supabase PostgreSQL schema
-- Catatan: barcode hanya untuk sparepart. Rak/ruangan tidak memakai barcode.

create extension if not exists "pgcrypto";

-- ============ ENUMS ============
do $$ begin
  create type app_role as enum ('owner', 'admin', 'mekanik', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_status as enum (
    'draft',
    'submitted_by_mechanic',
    'reviewed_by_admin',
    'waiting_owner_approval',
    'owner_approved',
    'owner_rejected',
    'purchase_pending',
    'purchased',
    'received_by_warehouse',
    'stock_out_ready',
    'stock_out_generated',
    'self_take_waiting_review',
    'self_take_rejected',
    'ongoing_maintenance',
    'completed',
    'revision_needed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type stock_movement_type as enum (
    'stock_in',
    'stock_out',
    'self_take_out',
    'adjustment_plus',
    'adjustment_minus',
    'return',
    'damaged'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_status as enum (
    'draft',
    'generated',
    'waiting_pickup',
    'picked_up',
    'self_taken',
    'waiting_verification',
    'verified',
    'rejected',
    'corrected',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

-- ============ USERS / ROLES ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role app_role not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ MASTER DATA ============
create table if not exists public.outlets (
  id uuid primary key default gen_random_uuid(),
  outlet_code text unique not null,
  outlet_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.motors (
  id uuid primary key default gen_random_uuid(),
  motor_code text unique not null,
  barcode_value text unique not null,
  plate_number text,
  brand text,
  motor_type text,
  color text,
  outlet_id uuid references public.outlets(id),
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spareparts (
  id uuid primary key default gen_random_uuid(),
  sparepart_code text unique not null, -- contoh SP-0001
  barcode_value text unique not null, -- sama dengan sparepart_code untuk barcode label
  name text not null,
  unit text not null default 'pcs',
  minimum_stock numeric(12,2) not null default 0,
  default_purchase_link text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lokasi hanya data teks untuk info penempatan. Tidak ada barcode lokasi/rak.
create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  room_name text not null,
  rack_name text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  sparepart_id uuid not null references public.spareparts(id) on delete cascade,
  location_id uuid references public.inventory_locations(id),
  qty_available numeric(12,2) not null default 0,
  qty_reserved numeric(12,2) not null default 0,
  qty_damaged numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (sparepart_id, location_id)
);

-- ============ DAMAGE REPORT / REQUEST ============
create table if not exists public.damage_reports (
  id uuid primary key default gen_random_uuid(),
  report_code text unique not null,
  motor_id uuid not null references public.motors(id),
  mechanic_id uuid references public.profiles(id),
  damage_category text,
  damage_notes text, -- rangkuman kerusakan dari mekanik
  drive_folder_path text, -- contoh Rental Motor Reports/Motor 079/2026-06-25 - RPT-...
  status request_status not null default 'submitted_by_mechanic',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.report_media (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.damage_reports(id) on delete cascade,
  media_type text not null check (media_type in ('photo', 'video', 'link')),
  file_url text, -- URL Google Drive / Supabase Storage
  drive_file_id text,
  drive_folder_path text,
  original_filename text,
  file_size bigint,
  media_note text, -- keterangan per foto/video: rusak bagian apa dan kenapa
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.part_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text unique not null,
  report_id uuid references public.damage_reports(id),
  motor_id uuid not null references public.motors(id),
  mechanic_id uuid references public.profiles(id),
  status request_status not null default 'submitted_by_mechanic',
  admin_review_by uuid references public.profiles(id),
  admin_ready_by uuid references public.profiles(id),
  admin_stock_out_by uuid references public.profiles(id),
  admin_received_by uuid references public.profiles(id),
  admin_purchase_by uuid references public.profiles(id),
  owner_approval_by uuid references public.profiles(id),
  stock_out_code text,
  admin_note text,
  owner_note text,
  cancel_note text,
  service_started_at timestamptz,
  maintenance_done_date date,
  ready_note text,
  previous_status request_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.part_request_items (
  id uuid primary key default gen_random_uuid(),
  part_request_id uuid not null references public.part_requests(id) on delete cascade,
  sparepart_id uuid references public.spareparts(id),
  manual_part_name text,
  qty_requested numeric(12,2) not null check (qty_requested > 0),
  qty_approved numeric(12,2) not null default 0,
  stock_snapshot numeric(12,2) not null default 0,
  stock_status text not null default 'unknown',
  recommended_purchase_link text,
  estimated_price numeric(14,2) not null default 0,
  admin_note text,
  owner_note text,
  status request_status not null default 'submitted_by_mechanic',
  created_at timestamptz not null default now()
);

-- ============ OWNER APPROVAL / PURCHASE ============
create table if not exists public.owner_approvals (
  id uuid primary key default gen_random_uuid(),
  approval_code text unique not null,
  part_request_id uuid not null references public.part_requests(id) on delete cascade,
  requested_by_admin uuid references public.profiles(id),
  owner_id uuid references public.profiles(id),
  status request_status not null default 'waiting_owner_approval',
  total_estimated_amount numeric(14,2) not null default 0,
  owner_note text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Bukti before checkout dari admin sebelum diajukan ke owner.
-- Screenshot asli disimpan di Google Drive/Supabase Storage, database menyimpan URL/file ID dan hasil OCR yang sudah divalidasi admin.
create table if not exists public.approval_checkout_proofs (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.owner_approvals(id) on delete cascade,
  marketplace text not null default 'Shopee',
  screenshot_url text,
  drive_file_id text,
  original_filename text,
  ocr_status text not null default 'manual_validated', -- ocr_draft, auto_filled, manual_validated
  ocr_engine text, -- google_vision, document_ai, tesseract_browser, demo_parser, manual
  ocr_confidence numeric(5,2),
  ocr_raw_text text,
  subtotal_items numeric(14,2) not null default 0,
  shipping_cost numeric(14,2) not null default 0,
  insurance_selected boolean not null default false,
  insurance_cost numeric(14,2) not null default 0,
  delivery_estimate_text text,
  delivery_estimate_days integer not null default 0,
  service_fee numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  total_before_checkout numeric(14,2) not null default 0,
  admin_note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (approval_id)
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  purchase_code text unique not null,
  approval_id uuid references public.owner_approvals(id),
  supplier_name text,
  marketplace text,
  order_link text,
  total_amount numeric(14,2) not null default 0,
  status text not null default 'purchase_pending',
  receipt_photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ STOCK MOVEMENT ============
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  movement_code text not null, -- SK-YYYYMMDD-0001 untuk satu transaksi stock keluar
  movement_type stock_movement_type not null,
  sparepart_id uuid not null references public.spareparts(id),
  location_id uuid references public.inventory_locations(id),
  qty numeric(12,2) not null check (qty > 0),
  reference_type text,
  reference_id uuid,
  motor_id uuid references public.motors(id),
  mechanic_id uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  verified_by uuid references public.profiles(id),
  status movement_status not null default 'generated',
  notes text,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table if not exists public.maintenance_ready_media (
  id uuid primary key default gen_random_uuid(),
  part_request_id uuid not null references public.part_requests(id) on delete cascade,
  media_type text not null check (media_type in ('photo', 'video', 'link')),
  file_url text,
  drive_file_id text,
  original_filename text,
  file_size bigint,
  media_note text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_damage_reports_motor on public.damage_reports(motor_id);
create index if not exists idx_part_requests_motor_status on public.part_requests(motor_id, status);
create index if not exists idx_request_items_request on public.part_request_items(part_request_id);
create index if not exists idx_stock_movements_code on public.stock_movements(movement_code);
create index if not exists idx_stock_movements_sparepart on public.stock_movements(sparepart_id);

-- Storage bucket yang disarankan di Supabase jika tidak memakai Google Drive:
-- insert into storage.buckets (id, name, public) values ('damage-media', 'damage-media', false)
-- on conflict (id) do nothing;

-- ============ v12 WHATSAPP AUTO REPORT / MOTOR STATUS AUDIT ============
create table if not exists public.whatsapp_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('request_created', 'motor_ready')),
  target_group text,
  message text not null,
  part_request_id uuid references public.part_requests(id) on delete set null,
  status text not null default 'queued',
  provider_response jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.motor_status_history (
  id uuid primary key default gen_random_uuid(),
  motor_id uuid not null references public.motors(id) on delete cascade,
  part_request_id uuid references public.part_requests(id) on delete set null,
  old_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_logs_request on public.whatsapp_logs(part_request_id);
create index if not exists idx_motor_status_history_motor on public.motor_status_history(motor_id, created_at desc);

-- v13: Bukti barang orderan tiba + OCR nomor pesanan dan pencocokan qty.
create table if not exists public.purchase_receive_proofs (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.owner_approvals(id) on delete cascade,
  request_id uuid references public.part_requests(id) on delete cascade,
  order_number text,
  order_screenshot_url text,
  goods_media_urls jsonb not null default '[]'::jsonb,
  ocr_engine text default 'gemini',
  ocr_confidence numeric(5,2),
  ocr_raw_text text,
  received_items jsonb not null default '[]'::jsonb,
  match_status text not null default 'partial', -- match, partial, mismatch
  match_summary text,
  admin_note text,
  received_by uuid references public.profiles(id),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (approval_id)
);
