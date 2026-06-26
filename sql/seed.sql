-- Optional seed. Jalankan hanya jika ingin contoh data awal.
insert into public.outlets (outlet_code, outlet_name) values
('CGG', 'Canggu'),
('KRW', 'Karawaci')
on conflict (outlet_code) do nothing;

insert into public.motors (motor_code, barcode_value, plate_number, motor_type, color, outlet_id, status)
select '079', '079', 'DK 0000 XX', 'Beat', 'Hitam', id, 'ready' from public.outlets where outlet_code = 'CGG'
on conflict (motor_code) do nothing;

insert into public.motors (motor_code, barcode_value, plate_number, motor_type, color, outlet_id, status)
select '109', '109', 'DK 0001 XX', 'Scoopy', 'Merah', id, 'maintenance' from public.outlets where outlet_code = 'CGG'
on conflict (motor_code) do nothing;

insert into public.motors (motor_code, barcode_value, plate_number, motor_type, color, outlet_id, status)
select '123', '123', 'DK 0002 XX', 'Vario', 'Biru', id, 'ready' from public.outlets where outlet_code = 'KRW'
on conflict (motor_code) do nothing;

insert into public.inventory_locations (room_name, rack_name, notes) values
('Gudang Sparepart 1', 'Rak 1 / Box Rem', 'Tidak memakai barcode rak'),
('Gudang Sparepart 1', 'Rak 2 / Area Ban', 'Tidak memakai barcode rak'),
('Gudang Sparepart 1', 'Lemari Aki', 'Tidak memakai barcode rak')
on conflict do nothing;

insert into public.spareparts (sparepart_code, barcode_value, name, unit, minimum_stock, default_purchase_link) values
('SP-0001', 'SP-0001', 'Kampas Rem Belakang', 'pcs', 2, null),
('SP-0002', 'SP-0002', 'Kampas Rem Depan', 'pcs', 2, null),
('SP-0003', 'SP-0003', 'Ban Belakang 90/90', 'pcs', 1, 'https://shopee.co.id/'),
('SP-0004', 'SP-0004', 'Aki Motor', 'pcs', 1, null)
on conflict (sparepart_code) do nothing;
