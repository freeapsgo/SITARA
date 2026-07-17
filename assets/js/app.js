// ============================================================
// APP STATE
// ============================================================
let currentProfile = null; // { id, nama, role }
let jenisBerkasList = [];  // [{id, nama}]
let kelengkapanList = [];  // [{id, jenis_berkas_id, nama}]
let statusList = [];       // [{id, nama}]
let currentDaftarBerkas = [];
let currentCariBerkasResults = [];
let daftarBerkasPage = 1;
const PAGE_SIZE = 10;
let selectedJenisIdForKelengkapan = null;
let chartStatusInstance = null;
let chartJenisInstance = null;
let chartLaporanInstance = null;
let currentLaporanPeriode = 'harian';

// ============================================================
// UI HELPERS: toast, loading, modal
// ============================================================
function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('show', show);
}

function showToast(message, type) {
  type = type || 'success';
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerText = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function confirmDialog(message) {
  return new Promise(resolve => {
    const ok = window.confirm(message);
    resolve(ok);
  });
}

function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function handleError(err) {
  showLoading(false);
  console.error(err);
  showToast(err.message || 'Terjadi kesalahan.', 'error');
}

// ============================================================
// AUTH
// ============================================================
document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  showLoading(true);
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    showLoading(false);
    showToast('Login gagal: ' + error.message, 'error');
    return;
  }
  await afterLogin(data.session);
});

async function afterLogin(session) {
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('id, nama, role')
    .eq('id', session.user.id)
    .single();

  if (error || !profile) {
    showLoading(false);
    showToast('Profil user tidak ditemukan. Hubungi Super Admin.', 'error');
    await supabaseClient.auth.signOut();
    return;
  }

  currentProfile = profile;
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appLayout').style.display = 'block';
  document.getElementById('userChipName').innerText = profile.nama;
  document.getElementById('userChipRole').innerText = profile.role;
  document.getElementById('userChipAvatar').innerText = (profile.nama || '?').charAt(0).toUpperCase();

  if (profile.role === 'Super Admin') {
    document.getElementById('menuUser').classList.remove('d-none');
  }

  await initAppData();
  showLoading(false);
  showPage('dashboard');
}

async function logout() {
  const ok = await confirmDialog('Yakin ingin logout?');
  if (!ok) return;
  await supabaseClient.auth.signOut();
  location.reload();
}

// Cek sesi yang masih aktif saat halaman dibuka ulang
(async function checkExistingSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    showLoading(true);
    await afterLogin(data.session);
  }
})();

async function logAksi(aksi, detail) {
  try {
    await supabaseClient.from('log_aktivitas').insert({
      user_nama: currentProfile ? currentProfile.nama : '-',
      aksi: aksi,
      detail: detail
    });
  } catch (e) { /* jangan sampai gagal log menghentikan proses utama */ }
}

// ============================================================
// INIT DATA SETELAH LOGIN
// ============================================================
async function initAppData() {
  const [jenisRes, kelRes, statusRes] = await Promise.all([
    supabaseClient.from('jenis_berkas').select('*').order('nama'),
    supabaseClient.from('kelengkapan').select('*').order('nama'),
    supabaseClient.from('status_master').select('*').order('nama')
  ]);

  jenisBerkasList = jenisRes.data || [];
  kelengkapanList = kelRes.data || [];
  statusList = statusRes.data || [];

  populateJenisDropdowns();
  populateStatusDropdowns();
  await ensureTersimpanStatusExists();
}

// ============================================================
// NAVIGASI HALAMAN
// ============================================================
const pageTitles = {
  dashboard: 'Dashboard',
  inputBerkas: 'Input Berkas Baru',
  daftarBerkas: 'Daftar Berkas',
  cariBerkas: 'Cari Berkas',
  masterJenis: 'Master Jenis & Kelengkapan',
  masterStatus: 'Master Status',
  manajemenUser: 'Manajemen User',
  logAktivitas: 'Log Aktivitas'
};

function showPage(page) {
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
  const navEl = document.querySelector(`.sidebar-link[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');
  document.getElementById('pageTitle').innerText = pageTitles[page] || '';
  closeSidebar();

  if (page === 'dashboard') loadDashboard();
  if (page === 'inputBerkas') resetInputForm();
  if (page === 'daftarBerkas') loadBerkas();
  if (page === 'masterJenis') renderJenisBerkasList();
  if (page === 'masterStatus') renderStatusList();
  if (page === 'manajemenUser') loadUsers();
  if (page === 'logAktivitas') loadLogs();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('show');
  document.getElementById('sidebarOverlay').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('show');
  document.getElementById('sidebarOverlay').classList.remove('show');
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  const { data: berkasData } = await supabaseClient.from('berkas').select('status_id, jenis_berkas_id, diambil');
  const { count: totalUsers } = await supabaseClient.from('profiles').select('*', { count: 'exact', head: true });

  const rows = berkasData || [];
  const totalBerkas = rows.length;
  const totalDiambil = rows.filter(r => r.diambil).length;

  document.getElementById('statTotalBerkas').innerText = totalBerkas;
  document.getElementById('statTotalDiambil').innerText = totalDiambil;
  document.getElementById('statBelumDiambil').innerText = totalBerkas - totalDiambil;
  document.getElementById('statTotalUsers').innerText = totalUsers || 0;

  const statusCounts = {};
  const jenisCounts = {};
  rows.forEach(r => {
    const statusNama = (statusList.find(s => s.id === r.status_id) || {}).nama || '-';
    const jenisNama = (jenisBerkasList.find(j => j.id === r.jenis_berkas_id) || {}).nama || '-';
    statusCounts[statusNama] = (statusCounts[statusNama] || 0) + 1;
    jenisCounts[jenisNama] = (jenisCounts[jenisNama] || 0) + 1;
  });

  const statusLabels = Object.keys(statusCounts);
  const statusValues = statusLabels.map(k => statusCounts[k]);
  const jenisLabels = Object.keys(jenisCounts);
  const jenisValues = jenisLabels.map(k => jenisCounts[k]);

  if (chartStatusInstance) chartStatusInstance.destroy();
  chartStatusInstance = new Chart(document.getElementById('chartStatus'), {
    type: 'doughnut',
    data: { labels: statusLabels, datasets: [{ data: statusValues, backgroundColor: ['#1B6E3C', '#6FCF97', '#BFE3CB', '#F2A93B', '#E24C4C', '#2E86DE'] }] }
  });

  if (chartJenisInstance) chartJenisInstance.destroy();
  chartJenisInstance = new Chart(document.getElementById('chartJenis'), {
    type: 'bar',
    data: { labels: jenisLabels, datasets: [{ label: 'Jumlah Berkas', data: jenisValues, backgroundColor: '#1B6E3C' }] },
    options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } }
  });

  loadLaporan(currentLaporanPeriode);
}

async function loadLaporan(periode) {
  currentLaporanPeriode = periode;
  ['Harian', 'Bulanan', 'Tahunan'].forEach(p => {
    document.getElementById('btnLaporan' + p).classList.toggle('active', p.toLowerCase() === periode);
  });

  const { data, error } = await supabaseClient.rpc('get_laporan', { p_periode: periode });
  if (error) { handleError(error); return; }

  const labels = (data || []).map(d => d.label);
  const tersimpan = (data || []).map(d => d.tersimpan);
  const diambil = (data || []).map(d => d.diambil);

  if (chartLaporanInstance) chartLaporanInstance.destroy();
  chartLaporanInstance = new Chart(document.getElementById('chartLaporan'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Tersimpan', data: tersimpan, borderColor: '#1B6E3C', backgroundColor: 'rgba(27,110,60,0.12)', tension: 0.3, fill: true },
        { label: 'Diambil', data: diambil, borderColor: '#2E86DE', backgroundColor: 'rgba(46,134,222,0.12)', tension: 0.3, fill: true }
      ]
    },
    options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });

  const tbody = document.getElementById('laporanTableBody');
  if (labels.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-muted">Belum ada data.</td></tr>';
  } else {
    tbody.innerHTML = labels.map((l, i) => `<tr><td>${l}</td><td>${tersimpan[i]}</td><td>${diambil[i]}</td></tr>`).join('');
  }
}

// ============================================================
// DROPDOWN HELPERS
// ============================================================
function populateJenisDropdowns() {
  const opts = '<option value="" disabled selected>Pilih Jenis Berkas...</option>' +
    jenisBerkasList.map(j => `<option value="${j.id}">${j.nama}</option>`).join('');
  document.getElementById('inJenisBerkas').innerHTML = opts;
  document.getElementById('editJenisBerkas').innerHTML = opts;

  const filterOpts = '<option value="All">Semua Jenis Berkas</option>' +
    jenisBerkasList.map(j => `<option value="${j.id}">${j.nama}</option>`).join('');
  document.getElementById('filterJenis').innerHTML = filterOpts;
}

function populateStatusDropdowns() {
  document.getElementById('editStatus').innerHTML = statusList.map(s => `<option value="${s.id}">${s.nama}</option>`).join('');

  const filterOpts = '<option value="All">Semua Status</option>' +
    statusList.map(s => `<option value="${s.id}">${s.nama}</option>`).join('');
  document.getElementById('filterStatus').innerHTML = filterOpts;
}

function getTersimpanStatusId() {
  const found = statusList.find(s => s.nama.trim().toLowerCase() === 'tersimpan');
  return found ? found.id : null;
}

async function ensureTersimpanStatusExists() {
  if (getTersimpanStatusId()) return;
  if (currentProfile.role !== 'Super Admin') return; // biarkan, akan dicek lagi saat submit

  const { data, error } = await supabaseClient.from('status_master').insert({ nama: 'Tersimpan' }).select().single();
  if (!error && data) {
    statusList.push(data);
    populateStatusDropdowns();
  }
}

function renderKelengkapanChecklist(mode, checkedNames) {
  const jenisSelectId = mode === 'input' ? 'inJenisBerkas' : 'editJenisBerkas';
  const boxId = mode === 'input' ? 'inKelengkapanBox' : 'editKelengkapanBox';
  const jenisId = document.getElementById(jenisSelectId).value;
  const box = document.getElementById(boxId);
  checkedNames = checkedNames || [];

  if (!jenisId) {
    box.innerHTML = '<span class="text-muted">Pilih Jenis Berkas dahulu.</span>';
    return;
  }
  const items = kelengkapanList.filter(k => String(k.jenis_berkas_id) === String(jenisId));
  if (items.length === 0) {
    box.innerHTML = '<span class="text-muted">Belum ada data Kelengkapan untuk jenis berkas ini. Tambahkan lewat menu "Jenis & Kelengkapan".</span>';
    return;
  }
  box.innerHTML = items.map(k => `
    <label class="checklist-item">
      <input type="checkbox" class="kelengkapan-checkbox-${mode}" value="${k.nama}" ${checkedNames.includes(k.nama) ? 'checked' : ''}>
      ${k.nama}
    </label>
  `).join('');
}

function getCheckedKelengkapan(mode) {
  return Array.from(document.querySelectorAll(`.kelengkapan-checkbox-${mode}:checked`)).map(el => el.value);
}

// ============================================================
// INPUT BERKAS
// ============================================================
function resetInputForm() {
  document.getElementById('inputBerkasForm').reset();
  document.getElementById('inKelengkapanBox').innerHTML = '<span class="text-muted">Pilih Jenis Berkas dahulu untuk menampilkan daftar kelengkapan.</span>';
}

document.getElementById('inputBerkasForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const tersimpanId = getTersimpanStatusId();
  if (!tersimpanId) {
    showToast('Status "Tersimpan" belum ada di Master Status. Minta Super Admin menambahkannya dulu di menu Master Status.', 'error');
    return;
  }

  const payload = {
    nama: document.getElementById('inNama').value.trim(),
    no_kendaraan: document.getElementById('inNoKendaraan').value.trim().toUpperCase(),
    no_hp: document.getElementById('inNoHp').value.trim(),
    jenis_berkas_id: Number(document.getElementById('inJenisBerkas').value),
    status_id: tersimpanId,
    kelengkapan: getCheckedKelengkapan('input')
  };

  showLoading(true);
  const { data: kodeData, error: kodeErr } = await supabaseClient.rpc('generate_kode_berkas', { p_jenis_berkas_id: payload.jenis_berkas_id });
  if (kodeErr) { handleError(kodeErr); return; }

  const { error } = await supabaseClient.from('berkas').insert({
    ...payload,
    kode_berkas: kodeData,
    diambil: false,
    dibuat_oleh: currentProfile.id
  });

  showLoading(false);
  if (error) { handleError(error); return; }

  await logAksi('Tambah Berkas', `Menambah berkas ${kodeData} a.n ${payload.nama}`);
  showToast(`Berkas berhasil disimpan dengan kode ${kodeData}.`);
  resetInputForm();
});

// ============================================================
// DAFTAR BERKAS
// ============================================================
// ============================================================
// EXPORT EXCEL
// ============================================================
async function exportBerkasExcel() {
  const startDate = document.getElementById('exportStartDate').value;
  const endDate = document.getElementById('exportEndDate').value;

  showLoading(true);
  let query = supabaseClient.from('berkas').select('*').order('created_at', { ascending: true });
  if (startDate) query = query.gte('created_at', startDate + 'T00:00:00');
  if (endDate) query = query.lte('created_at', endDate + 'T23:59:59');

  const { data, error } = await query;
  showLoading(false);
  if (error) { handleError(error); return; }

  if (!data || data.length === 0) {
    showToast('Tidak ada data pada rentang tanggal tersebut.', 'warning');
    return;
  }

  const exportRows = data.map(row => {
    const mapped = mapBerkasRow(row);
    return {
      'Kode Berkas': mapped.kodeBerkas,
      'Nama': mapped.nama,
      'No. Kendaraan': mapped.noKendaraan,
      'No. HP': mapped.noHp,
      'Jenis Berkas': mapped.jenisBerkasNama,
      'Kelengkapan': mapped.kelengkapan.join(', ') || '-',
      'Status': mapped.statusNama,
      'Sudah Diambil': mapped.diambil ? 'Ya' : 'Tidak',
      'Tanggal Ambil': mapped.tanggalAmbil || '-',
      'Tanggal Input': new Date(row.created_at).toLocaleString('id-ID'),
    };
  });

  const ws = XLSX.utils.json_to_sheet(exportRows);
  ws['!cols'] = [
    { wch: 13 }, { wch: 22 }, { wch: 14 }, { wch: 15 }, { wch: 18 },
    { wch: 35 }, { wch: 14 }, { wch: 13 }, { wch: 18 }, { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Berkas');

  const labelRange = (startDate || 'awal') + '_sd_' + (endDate || 'sekarang');
  const fileName = `Data-Berkas-Kendaraan_${labelRange}.xlsx`;
  XLSX.writeFile(wb, fileName);

  await logAksi('Export Excel', `Export ${data.length} data berkas` + (startDate || endDate ? ` (rentang ${startDate || 'awal'} s/d ${endDate || 'sekarang'})` : ' (semua data)'));
  showToast(`Berhasil export ${data.length} data ke Excel.`);
}

async function loadBerkas() {
  showLoading(true);
  const statusFilter = document.getElementById('filterStatus').value;
  const jenisFilter = document.getElementById('filterJenis').value;

  let query = supabaseClient.from('berkas').select('*').order('created_at', { ascending: false });
  if (statusFilter && statusFilter !== 'All') query = query.eq('status_id', statusFilter);
  if (jenisFilter && jenisFilter !== 'All') query = query.eq('jenis_berkas_id', jenisFilter);

  const { data, error } = await query;
  showLoading(false);
  if (error) { handleError(error); return; }

  currentDaftarBerkas = (data || []).map(mapBerkasRow);
  daftarBerkasPage = 1;
  renderDaftarBerkasTable();
}

function mapBerkasRow(row) {
  return {
    id: row.id,
    kodeBerkas: row.kode_berkas,
    nama: row.nama,
    noKendaraan: row.no_kendaraan,
    noHp: row.no_hp,
    jenisBerkasId: row.jenis_berkas_id,
    jenisBerkasNama: (jenisBerkasList.find(j => j.id === row.jenis_berkas_id) || {}).nama || '-',
    statusId: row.status_id,
    statusNama: (statusList.find(s => s.id === row.status_id) || {}).nama || '-',
    kelengkapan: row.kelengkapan || [],
    diambil: row.diambil,
    tanggalAmbil: row.tanggal_ambil ? new Date(row.tanggal_ambil).toLocaleString('id-ID') : ''
  };
}

function renderAmbilBadge(item) {
  if (item.diambil) {
    return `<span class="badge badge-success" style="cursor:pointer" onclick="openReviewBerkasModal(${item.id})">✓ Sudah Diambil</span>`;
  }
  return `<span class="badge badge-warning">Belum Diambil</span>`;
}

function renderAmbilButton(item) {
  const cls = item.diambil ? 'btn-success' : 'btn-warning';
  return `<button class="btn ${cls} btn-sm btn-icon" onclick="openReviewBerkasModal(${item.id})" title="Review &amp; Ambil Berkas"><i class="fa-solid fa-box-open"></i></button>`;
}

function getFilteredDaftarBerkas() {
  const ambilFilter = document.getElementById('filterAmbil').value;
  if (ambilFilter === 'Belum') return currentDaftarBerkas.filter(i => !i.diambil);
  if (ambilFilter === 'Sudah') return currentDaftarBerkas.filter(i => i.diambil);
  return currentDaftarBerkas;
}

function renderDaftarBerkasTable() {
  const tbody = document.getElementById('daftarBerkasBody');
  const filtered = getFilteredDaftarBerkas();
  document.getElementById('totalDaftarBerkas').innerText = filtered.length + ' berkas';

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-muted">Belum ada data berkas.</td></tr>';
    document.getElementById('paginationDaftar').innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  if (daftarBerkasPage > totalPages) daftarBerkasPage = 1;
  const startIdx = (daftarBerkasPage - 1) * PAGE_SIZE;
  const pageData = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  tbody.innerHTML = pageData.map(item => `
    <tr>
      <td style="font-weight:700;color:var(--primary)">${item.kodeBerkas}</td>
      <td>${item.nama}</td>
      <td>${item.noKendaraan}</td>
      <td>${item.noHp}</td>
      <td>${item.jenisBerkasNama}</td>
      <td>${item.kelengkapan.map(k => `<span class="badge badge-kelengkapan">${k}</span>`).join(' ') || '<span class="text-muted">-</span>'}</td>
      <td><span class="badge badge-secondary">${item.statusNama}</span></td>
      <td>${renderAmbilBadge(item)}</td>
      <td>
        <button class="btn btn-outline btn-sm btn-icon" onclick="openEditBerkasModal(${item.id})" title="Edit"><i class="fa-solid fa-pen"></i></button>
        ${renderAmbilButton(item)}
        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteBerkasConfirm(${item.id})" title="Hapus"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const pag = document.getElementById('paginationDaftar');
  if (totalPages <= 1) { pag.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="${i === daftarBerkasPage ? 'active' : ''}" onclick="daftarBerkasPage=${i}; renderDaftarBerkasTable();">${i}</button>`;
  }
  pag.innerHTML = html;
}

function findBerkasById(id) {
  return currentDaftarBerkas.find(x => x.id == id) || currentCariBerkasResults.find(x => x.id == id);
}

function openEditBerkasModal(id) {
  const item = findBerkasById(id);
  if (!item) { showToast('Data tidak ditemukan.', 'error'); return; }

  document.getElementById('editId').value = item.id;
  document.getElementById('editNama').value = item.nama;
  document.getElementById('editNoKendaraan').value = item.noKendaraan;
  document.getElementById('editNoHp').value = item.noHp;
  document.getElementById('editStatus').value = item.statusId;
  document.getElementById('editJenisBerkas').value = item.jenisBerkasId;
  document.getElementById('editKode').value = item.kodeBerkas;

  renderKelengkapanChecklist('edit', item.kelengkapan);
  openModal('editBerkasModal');
}

document.getElementById('editBerkasForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const id = document.getElementById('editId').value;
  const payload = {
    nama: document.getElementById('editNama').value.trim(),
    no_kendaraan: document.getElementById('editNoKendaraan').value.trim().toUpperCase(),
    no_hp: document.getElementById('editNoHp').value.trim(),
    jenis_berkas_id: Number(document.getElementById('editJenisBerkas').value),
    status_id: Number(document.getElementById('editStatus').value),
    kelengkapan: getCheckedKelengkapan('edit')
  };

  showLoading(true);
  const { error } = await supabaseClient.from('berkas').update(payload).eq('id', id);
  showLoading(false);
  if (error) { handleError(error); return; }

  closeModal('editBerkasModal');
  await logAksi('Update Berkas', `Update berkas ${document.getElementById('editKode').value} a.n ${payload.nama}`);
  showToast('Data berkas berhasil diperbarui.');
  loadBerkas();
});

async function deleteBerkasConfirm(id) {
  const ok = await confirmDialog('Hapus berkas ini? Tindakan tidak bisa dibatalkan.');
  if (!ok) return;
  const item = findBerkasById(id);

  showLoading(true);
  const { error } = await supabaseClient.from('berkas').delete().eq('id', id);
  showLoading(false);
  if (error) { handleError(error); return; }

  await logAksi('Hapus Berkas', `Menghapus berkas ${item ? item.kodeBerkas : id}`);
  showToast('Data berkas berhasil dihapus.');
  loadBerkas();
}

// ============================================================
// REVIEW & AMBIL BERKAS
// ============================================================
function openReviewBerkasModal(id) {
  const item = findBerkasById(id);
  if (!item) { showToast('Data tidak ditemukan.', 'error'); return; }

  document.getElementById('reviewId').value = item.id;
  document.getElementById('reviewKode').innerText = item.kodeBerkas;
  document.getElementById('reviewNama').innerText = item.nama;
  document.getElementById('reviewNoKendaraan').innerText = item.noKendaraan;
  document.getElementById('reviewNoHp').innerText = item.noHp;
  document.getElementById('reviewJenisBerkas').innerText = item.jenisBerkasNama;
  document.getElementById('reviewStatus').innerText = item.statusNama;

  const allKelengkapan = kelengkapanList.filter(k => String(k.jenis_berkas_id) === String(item.jenisBerkasId));
  const box = document.getElementById('reviewKelengkapanBox');
  if (allKelengkapan.length === 0) {
    box.innerHTML = '<span class="text-muted">Tidak ada data kelengkapan untuk jenis berkas ini.</span>';
  } else {
    box.innerHTML = allKelengkapan.map(k => {
      const checked = item.kelengkapan.includes(k.nama);
      return `<div style="margin-bottom:4px;">${checked ? '✅' : '⬜'} ${k.nama}</div>`;
    }).join('');
  }

  const infoBox = document.getElementById('reviewAmbilInfo');
  const btnAmbil = document.getElementById('btnKonfirmasiAmbil');
  if (item.diambil) {
    infoBox.classList.remove('d-none');
    infoBox.innerText = `Berkas ini sudah diambil pada ${item.tanggalAmbil}.`;
    btnAmbil.classList.add('d-none');
  } else {
    infoBox.classList.add('d-none');
    btnAmbil.classList.remove('d-none');
  }

  openModal('reviewBerkasModal');
}

async function konfirmasiAmbilBerkas() {
  const id = document.getElementById('reviewId').value;
  const ok = await confirmDialog('Pastikan kelengkapan yang tercentang sudah sesuai fisik berkas. Tandai sebagai sudah diambil?');
  if (!ok) return;

  showLoading(true);
  const { error } = await supabaseClient.from('berkas')
    .update({ diambil: true, tanggal_ambil: new Date().toISOString() })
    .eq('id', id);
  showLoading(false);
  if (error) { handleError(error); return; }

  const item = findBerkasById(id);
  await logAksi('Ambil Berkas', `Berkas ${item ? item.kodeBerkas : id} telah diambil`);
  closeModal('reviewBerkasModal');
  showToast('Berkas telah ditandai sebagai sudah diambil.');
  loadBerkas();
  loadDashboard();
}

// ============================================================
// CARI BERKAS
// ============================================================
async function searchBerkas() {
  const keyword = document.getElementById('searchBerkasInput').value.trim();
  if (!keyword) { showToast('Masukkan Nama, No. HP, atau No. Kendaraan.', 'warning'); return; }

  showLoading(true);
  const { data, error } = await supabaseClient
    .from('berkas')
    .select('*')
    .or(`nama.ilike.%${keyword}%,no_hp.ilike.%${keyword}%,no_kendaraan.ilike.%${keyword}%`)
    .order('created_at', { ascending: false });
  showLoading(false);
  if (error) { handleError(error); return; }

  currentCariBerkasResults = (data || []).map(mapBerkasRow);
  const tbody = document.getElementById('cariBerkasBody');
  if (currentCariBerkasResults.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-muted">Tidak ada berkas yang cocok.</td></tr>';
    return;
  }
  tbody.innerHTML = currentCariBerkasResults.map(item => `
    <tr>
      <td style="font-weight:700;color:var(--primary)">${item.kodeBerkas}</td>
      <td>${item.nama}</td>
      <td>${item.noKendaraan}</td>
      <td>${item.noHp}</td>
      <td>${item.jenisBerkasNama}</td>
      <td>${item.kelengkapan.map(k => `<span class="badge badge-kelengkapan">${k}</span>`).join(' ') || '-'}</td>
      <td><span class="badge badge-secondary">${item.statusNama}</span></td>
      <td>${renderAmbilBadge(item)}</td>
      <td>
        <button class="btn btn-outline btn-sm btn-icon" onclick="openEditBerkasModal(${item.id})" title="Edit"><i class="fa-solid fa-pen"></i></button>
        ${renderAmbilButton(item)}
      </td>
    </tr>
  `).join('');
}

document.getElementById('searchBerkasInput').addEventListener('keypress', function (e) {
  if (e.key === 'Enter') { e.preventDefault(); searchBerkas(); }
});

// ============================================================
// MASTER: JENIS BERKAS & KELENGKAPAN
// ============================================================
function renderJenisBerkasList() {
  const container = document.getElementById('jenisBerkasList');
  if (jenisBerkasList.length === 0) {
    container.innerHTML = '<p class="text-muted">Belum ada Jenis Berkas.</p>';
    return;
  }
  container.innerHTML = jenisBerkasList.map(j => `
    <div class="checklist-item" style="justify-content:space-between;cursor:pointer;${selectedJenisIdForKelengkapan == j.id ? 'border-color:var(--primary);background:var(--primary-light);' : ''}" onclick="selectJenisForKelengkapan(${j.id}, '${escapeQuote(j.nama)}')">
      <span>${j.nama} <span class="badge badge-secondary" style="margin-left:4px;">${j.kode_prefix || 'BRK'}</span></span>
      <span>
        <button class="btn btn-outline btn-sm btn-icon" onclick="event.stopPropagation(); openJenisModal(${j.id}, '${escapeQuote(j.nama)}', '${escapeQuote(j.kode_prefix || '')}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="event.stopPropagation(); deleteJenisConfirm(${j.id})"><i class="fa-solid fa-trash"></i></button>
      </span>
    </div>
  `).join('');
}

function escapeQuote(str) { return String(str).replace(/'/g, "\\'"); }

function selectJenisForKelengkapan(id, nama) {
  selectedJenisIdForKelengkapan = id;
  document.getElementById('selectedJenisLabel').innerText = nama;
  document.getElementById('btnTambahKelengkapan').disabled = false;
  renderJenisBerkasList();
  renderKelengkapanListForSelected();
}

function renderKelengkapanListForSelected() {
  const container = document.getElementById('kelengkapanList');
  const items = kelengkapanList.filter(k => k.jenis_berkas_id === selectedJenisIdForKelengkapan);
  if (items.length === 0) {
    container.innerHTML = '<p class="text-muted">Belum ada Kelengkapan untuk jenis berkas ini.</p>';
    return;
  }
  container.innerHTML = items.map(k => `
    <div class="checklist-item" style="justify-content:space-between;">
      <span>${k.nama}</span>
      <span>
        <button class="btn btn-outline btn-sm btn-icon" onclick="openKelengkapanModal(${k.id}, '${escapeQuote(k.nama)}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteKelengkapanConfirm(${k.id})"><i class="fa-solid fa-trash"></i></button>
      </span>
    </div>
  `).join('');
}

function openJenisModal(id, nama, kodePrefix) {
  document.getElementById('jenisForm').reset();
  document.getElementById('jenisId').value = id || '';
  document.getElementById('jenisNama').value = nama || '';
  document.getElementById('jenisKodePrefix').value = kodePrefix || '';
  document.getElementById('jenisModalTitle').innerText = id ? 'Edit Jenis Berkas' : 'Tambah Jenis Berkas';
  openModal('jenisModal');
}

document.getElementById('jenisForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const id = document.getElementById('jenisId').value;
  const nama = document.getElementById('jenisNama').value.trim();
  const kodePrefix = document.getElementById('jenisKodePrefix').value.trim().toUpperCase();

  const duplikat = jenisBerkasList.some(j => j.kode_prefix === kodePrefix && String(j.id) !== String(id));
  if (duplikat) {
    showToast(`Kode Prefix "${kodePrefix}" sudah dipakai Jenis Berkas lain. Gunakan prefix yang berbeda.`, 'error');
    return;
  }

  showLoading(true);
  const { error } = id
    ? await supabaseClient.from('jenis_berkas').update({ nama, kode_prefix: kodePrefix }).eq('id', id)
    : await supabaseClient.from('jenis_berkas').insert({ nama, kode_prefix: kodePrefix });
  showLoading(false);

  if (error) { handleError(error); return; }
  closeModal('jenisModal');
  await refreshMasterData();
  renderJenisBerkasList();
  showToast('Jenis Berkas berhasil disimpan.');
});

async function deleteJenisConfirm(id) {
  const ok = await confirmDialog('Hapus Jenis Berkas ini? Semua Kelengkapan di dalamnya juga akan terhapus.');
  if (!ok) return;

  showLoading(true);
  const { error } = await supabaseClient.from('jenis_berkas').delete().eq('id', id);
  showLoading(false);
  if (error) { handleError(error); return; }

  selectedJenisIdForKelengkapan = null;
  await refreshMasterData();
  renderJenisBerkasList();
  document.getElementById('kelengkapanList').innerHTML = '<p class="text-muted">Pilih salah satu Jenis Berkas di sebelah kiri.</p>';
  document.getElementById('selectedJenisLabel').innerText = '- pilih jenis berkas -';
  document.getElementById('btnTambahKelengkapan').disabled = true;
  showToast('Jenis Berkas berhasil dihapus.');
}

function openKelengkapanModal(id, nama) {
  if (!selectedJenisIdForKelengkapan) return;
  document.getElementById('kelengkapanForm').reset();
  document.getElementById('kelengkapanId').value = id || '';
  document.getElementById('kelengkapanNama').value = nama || '';
  document.getElementById('kelengkapanModalTitle').innerText = id ? 'Edit Kelengkapan' : 'Tambah Kelengkapan';
  openModal('kelengkapanModal');
}

document.getElementById('kelengkapanForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const id = document.getElementById('kelengkapanId').value;
  const nama = document.getElementById('kelengkapanNama').value.trim();

  showLoading(true);
  const { error } = id
    ? await supabaseClient.from('kelengkapan').update({ nama }).eq('id', id)
    : await supabaseClient.from('kelengkapan').insert({ nama, jenis_berkas_id: selectedJenisIdForKelengkapan });
  showLoading(false);

  if (error) { handleError(error); return; }
  closeModal('kelengkapanModal');
  await refreshMasterData();
  renderKelengkapanListForSelected();
  showToast('Kelengkapan berhasil disimpan.');
});

async function deleteKelengkapanConfirm(id) {
  const ok = await confirmDialog('Hapus Kelengkapan ini?');
  if (!ok) return;

  showLoading(true);
  const { error } = await supabaseClient.from('kelengkapan').delete().eq('id', id);
  showLoading(false);
  if (error) { handleError(error); return; }

  await refreshMasterData();
  renderKelengkapanListForSelected();
  showToast('Kelengkapan berhasil dihapus.');
}

async function refreshMasterData() {
  const [jenisRes, kelRes] = await Promise.all([
    supabaseClient.from('jenis_berkas').select('*').order('nama'),
    supabaseClient.from('kelengkapan').select('*').order('nama')
  ]);
  jenisBerkasList = jenisRes.data || [];
  kelengkapanList = kelRes.data || [];
  populateJenisDropdowns();
}

// ============================================================
// MASTER: STATUS
// ============================================================
function renderStatusList() {
  const container = document.getElementById('statusList');
  if (statusList.length === 0) {
    container.innerHTML = '<p class="text-muted">Belum ada Status.</p>';
    return;
  }
  container.innerHTML = statusList.map(s => `
    <div class="checklist-item" style="justify-content:space-between;">
      <span>${s.nama}</span>
      <span>
        <button class="btn btn-outline btn-sm btn-icon" onclick="openStatusModal(${s.id}, '${escapeQuote(s.nama)}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteStatusConfirm(${s.id})"><i class="fa-solid fa-trash"></i></button>
      </span>
    </div>
  `).join('');
}

function openStatusModal(id, nama) {
  document.getElementById('statusForm').reset();
  document.getElementById('statusId').value = id || '';
  document.getElementById('statusNama').value = nama || '';
  document.getElementById('statusModalTitle').innerText = id ? 'Edit Status' : 'Tambah Status';
  openModal('statusModal');
}

document.getElementById('statusForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const id = document.getElementById('statusId').value;
  const nama = document.getElementById('statusNama').value.trim();

  showLoading(true);
  const { error } = id
    ? await supabaseClient.from('status_master').update({ nama }).eq('id', id)
    : await supabaseClient.from('status_master').insert({ nama });
  showLoading(false);

  if (error) { handleError(error); return; }
  const { data } = await supabaseClient.from('status_master').select('*').order('nama');
  statusList = data || [];
  populateStatusDropdowns();
  renderStatusList();
  closeModal('statusModal');
  showToast('Status berhasil disimpan.');
});

async function deleteStatusConfirm(id) {
  const ok = await confirmDialog('Hapus Status ini?');
  if (!ok) return;

  showLoading(true);
  const { error } = await supabaseClient.from('status_master').delete().eq('id', id);
  showLoading(false);
  if (error) { handleError(error); return; }

  const { data } = await supabaseClient.from('status_master').select('*').order('nama');
  statusList = data || [];
  populateStatusDropdowns();
  renderStatusList();
  showToast('Status berhasil dihapus.');
}

// ============================================================
// MANAJEMEN USER (khusus Super Admin)
// mengelola nama & role di tabel profiles.
// Membuat AKUN LOGIN baru dilakukan lewat Supabase Dashboard
// (lihat README) karena butuh service_role key yang tidak boleh
// ditaruh di kode publik GitHub Pages.
// ============================================================
function openCreateUserModal() {
  document.getElementById('createUserForm').reset();
  openModal('createUserModal');
}

document.getElementById('createUserForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const payload = {
    nama: document.getElementById('newUserNama').value.trim(),
    email: document.getElementById('newUserEmail').value.trim(),
    password: document.getElementById('newUserPassword').value,
    role: document.getElementById('newUserRole').value
  };

  showLoading(true);
  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const token = sessionData.session.access_token;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    showLoading(false);

    if (!res.ok) {
      showToast(result.error || 'Gagal membuat user.', 'error');
      return;
    }

    closeModal('createUserModal');
    await logAksi('Tambah User', `Menambahkan user baru: ${payload.nama} (${payload.role})`);
    showToast('User baru berhasil dibuat.');
    loadUsers();
  } catch (err) {
    handleError(err);
  }
});

async function loadUsers() {
  showLoading(true);
  const { data, error } = await supabaseClient.from('profiles').select('*').order('nama');
  showLoading(false);
  if (error) { handleError(error); return; }

  const tbody = document.getElementById('userTableBody');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-muted">Belum ada data user.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(u => `
    <tr>
      <td style="font-weight:600;">${u.nama}</td>
      <td><span class="badge badge-secondary">${u.role}</span></td>
      <td><button class="btn btn-outline btn-sm btn-icon" onclick='openUserModal(${JSON.stringify(u.id)}, ${JSON.stringify(u.nama)}, ${JSON.stringify(u.role)})'><i class="fa-solid fa-pen"></i></button></td>
    </tr>
  `).join('');
}

function openUserModal(id, nama, role) {
  document.getElementById('userForm').reset();
  document.getElementById('userId').value = id;
  document.getElementById('userNama').value = nama;
  document.getElementById('userRole').value = role;
  openModal('userModal');
}

document.getElementById('userForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const id = document.getElementById('userId').value;
  const payload = {
    nama: document.getElementById('userNama').value.trim(),
    role: document.getElementById('userRole').value
  };

  showLoading(true);
  const { error } = await supabaseClient.from('profiles').update(payload).eq('id', id);
  showLoading(false);
  if (error) { handleError(error); return; }

  closeModal('userModal');
  loadUsers();
  showToast('Data user berhasil diperbarui.');
});

// ============================================================
// LOG AKTIVITAS
// ============================================================
async function loadLogs() {
  showLoading(true);
  const { data, error } = await supabaseClient
    .from('log_aktivitas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  showLoading(false);
  if (error) { handleError(error); return; }

  const tbody = document.getElementById('logTableBody');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-muted">Belum ada log aktivitas.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(log => `
    <tr>
      <td style="white-space:nowrap;">${new Date(log.created_at).toLocaleString('id-ID')}</td>
      <td style="font-weight:600;color:var(--primary)">${log.user_nama || '-'}</td>
      <td>${log.aksi}</td>
      <td>${log.detail || ''}</td>
    </tr>
  `).join('');
}
