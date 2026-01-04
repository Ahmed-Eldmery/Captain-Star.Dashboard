const API_BASE = 'http://localhost:4000';
let auth = null;


// ===== Auth =====
function login() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  fetch(API_BASE + '/auth/login', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({email,password})
  }).then(r=>r.json()).then(data=>{
    if(data.token){
      auth = data;
      document.getElementById('loginView').classList.add('hidden');
      document.getElementById('appView').classList.remove('hidden');

      document.getElementById('topUserName').innerText = data.name;
      document.getElementById('topUserRole').innerText = data.role.toUpperCase();

      // تقييد واجهة المستخدم لليوزر العادي
      if(data.role === 'user'){
        document.getElementById('btnUsers').style.display='none';
        document.getElementById('btnAddClient').style.display='none';
      }

      showPage('dashboard');
      loadDashboard();
      loadClients();
      if(data.role === 'owner') loadUsers();
    }else{
      document.getElementById('loginError').innerText = data.message || 'Login failed';
    }
  }).catch(()=>{
    document.getElementById('loginError').innerText = 'Error connecting to server';
  });
}

function logout(){
  auth = null;
  document.getElementById('appView').classList.add('hidden');
  document.getElementById('loginView').classList.remove('hidden');
}


// ===== Navigation =====
function showPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  document.getElementById('btnDashboard').classList.remove('active');
  document.getElementById('btnClients').classList.remove('active');
  document.getElementById('btnUsers').classList.remove('active');

  if(page === 'dashboard'){
    document.getElementById('pageDashboard').classList.remove('hidden');
    document.getElementById('btnDashboard').classList.add('active');
  }else if(page === 'clients'){
    document.getElementById('pageClients').classList.remove('hidden');
    document.getElementById('btnClients').classList.add('active');
  }else if(page === 'users'){
    document.getElementById('pageUsers').classList.remove('hidden');
    document.getElementById('btnUsers').classList.add('active');
  }
}

function toggleUserMenu(e){
  e.stopPropagation();
  const menu = document.getElementById('userMenu');
  menu.classList.toggle('hidden');
}

// قفل المنيو لو دوسنا في أي حتة براها
document.addEventListener('click', () => {
  const menu = document.getElementById('userMenu');
  if(menu && !menu.classList.contains('hidden')){
    menu.classList.add('hidden');
  }
});

// ===== Helper API wrappers =====
function apiGet(url){
  return fetch(API_BASE+url, { headers:{'Authorization':'Bearer '+auth.token} }).then(r=>r.json());
}
function apiPost(url, body){
  return fetch(API_BASE+url, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+auth.token},
    body: JSON.stringify(body)
  }).then(r=>r.json());
}
function apiPut(url, body){
  return fetch(API_BASE+url, {
    method:'PUT',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+auth.token},
    body: JSON.stringify(body)
  }).then(r=>r.json());
}
function apiDelete(url){
  return fetch(API_BASE+url, {
    method:'DELETE',
    headers:{'Authorization':'Bearer '+auth.token}
  }).then(r=>r.json());
}

// هيلبر بسيط للصلاحيات في الفرونت
function canEdit(){
  return auth && (auth.role === 'owner' || auth.role === 'admin');
}


// ===== Dashboard (Social Accounts) =====
function loadDashboard(){
  const platform = document.getElementById('dashPlatform').value;
  const search = document.getElementById('dashSearch').value;
  let q = [];
  if(platform) q.push('platform='+platform);
  if(search) q.push('search='+encodeURIComponent(search));
  const qs = q.length ? '?'+q.join('&') : '';
  apiGet('/social-accounts'+qs).then(data=>{
    const div = document.getElementById('dashboardTable');
    let html = '<div class="card"><table><thead><tr><th>Client</th><th>Platform</th><th>Handle</th><th>Open</th></tr></thead><tbody>';
    (data || []).forEach(a=>{
      html += `<tr>
        <td>${a.client_name}</td>
        <td>${a.platform}</td>
        <td>${a.handle}</td>
        <td><button class="btn btn-secondary" onclick="window.open('${a.url}','_blank')">Open</button></td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    div.innerHTML = html;
  });
}


// ===== Clients =====
function loadClients(){
  apiGet('/clients').then(data=>{
    const div = document.getElementById('clientsList');
    let html = '<div class="card"><table><thead><tr><th>Name</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
    (data || []).forEach(c=>{
      html += `<tr>
        <td>${c.name}</td>
        <td>${c.is_active ? 'Active' : 'Inactive'}</td>
        <td>
          <button class="btn btn-secondary" onclick="viewClient(${c.id})">View</button>
          ${canEdit() ? `<button class="btn btn-secondary" onclick="editClient(${c.id})">Edit</button>` : ''}
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    div.innerHTML = html;
  });
}

function openClientForm(client){
  // منع فتح الفورم لليوزر العادي
  if(!canEdit()){
    return;
  }

  const container = document.getElementById('clientFormContainer');
  container.classList.remove('hidden');
  document.getElementById('clientDetailContainer').classList.add('hidden');

  const isEdit = !!client;
  container.innerHTML = `
    <h3>${isEdit ? 'Edit Client' : 'Create New Client'}</h3>
    
    <div class="flex">
      <div>
        <label>Client Name</label>
        <input id="cf_name" placeholder="e.g. Dr. Ahmed Clinic" value="${client ? client.name : ''}" />
      </div>
      <div>
        <label>Logo URL (optional)</label>
        <input id="cf_logo" placeholder="https://..." value="${client ? (client.logo_url || '') : ''}" />
      </div>
    </div>

    <label>Internal Notes (for team)</label>
    <textarea id="cf_notes" placeholder="Guidelines, tone of voice, forbidden words...">${client ? (client.notes || '') : ''}</textarea>

    <label>Status</label>
    <select id="cf_active">
      <option value="1" ${!client || client.is_active ? 'selected' : ''}>Active</option>
      <option value="0" ${client && !client.is_active ? 'selected' : ''}>Inactive</option>
    </select>

    <div class="card" style="margin-top:10px;">
      <h4>Quick Social Setup (optional)</h4>
      <div class="flex">
        <div>
          <label>Platform</label>
          <select id="cf_soc_platform">
            <option value="">-- select --</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="snapchat">Snapchat</option>
            <option value="youtube">YouTube</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
            <option value="x">X (Twitter)</option>
            <option value="linkedin">LinkedIn</option>
            <option value="pinterest">Pinterest</option>
            <option value="threads">Threads</option>
            <option value="discord">Discord</option>
            <option value="twitch">Twitch</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label>Handle</label>
          <input id="cf_soc_handle" placeholder="@client_handle" />
        </div>
      </div>
      <label>Profile URL</label>
      <input id="cf_soc_url" placeholder="https://..." />
      <label>Label</label>
      <input id="cf_soc_label" placeholder="Main / Backup / Support" />
      <div class="small" style="margin-top:4px;">
        If you fill this section, the first social account will be created automatically with the client.
      </div>
    </div>

    <button class="btn btn-primary" onclick="${isEdit ? `saveClient(${client.id})` : 'saveClient()'}">Save Client</button>
    <button class="btn" onclick="closeClientForm()">Cancel</button>
  `;
}

function closeClientForm(){
  document.getElementById('clientFormContainer').classList.add('hidden');
}

function saveClient(id){
  // حماية زيادة: منع التنفيذ لو مش owner/admin
  if(!canEdit()){
    alert('You do not have permission to modify clients.');
    return;
  }

  const body = {
    name: document.getElementById('cf_name').value,
    logo_url: document.getElementById('cf_logo').value,
    notes: document.getElementById('cf_notes').value,
    is_active: document.getElementById('cf_active').value === '1'
  };

  if(!body.name){
    alert('Client name is required');
    return;
  }

  const socPlatform = document.getElementById('cf_soc_platform')?.value || '';
  const socHandle   = document.getElementById('cf_soc_handle')?.value || '';
  const socUrl      = document.getElementById('cf_soc_url')?.value || '';
  const socLabel    = document.getElementById('cf_soc_label')?.value || '';

  if(id){
    apiPut('/clients/'+id, body).then((res)=>{
      closeClientForm();
      loadClients();
      if(res && res.id){
        viewClient(res.id);
      }
      alert('Client updated successfully');
    });
  }else{
    apiPost('/clients', body).then((res)=>{
      if(res && res.id){
        if(socPlatform && socHandle && socUrl){
          const accBody = {
            platform: socPlatform,
            handle: socHandle,
            url: socUrl,
            label: socLabel,
            is_active: true
          };
          apiPost('/clients/'+res.id+'/social-accounts', accBody).then(()=>{
            closeClientForm();
            loadClients();
            viewClient(res.id);
            alert('Client & first social account created successfully');
          });
        } else {
          closeClientForm();
          loadClients();
          viewClient(res.id);
          alert('Client created successfully');
        }
      } else {
        alert('Error creating client');
      }
    });
  }
}

function viewClient(id){
  apiGet('/clients/'+id).then(data=>{
    const c = data.client;
    const accounts = data.accounts || [];
    const div = document.getElementById('clientDetailContainer');
    div.classList.remove('hidden');
    document.getElementById('clientFormContainer').classList.add('hidden');

    let accHtml = `<table><thead><tr><th>Platform</th><th>Handle</th><th>Label</th><th>Status</th><th>Open</th>${canEdit()?'<th>Edit</th>':''}</tr></thead><tbody>`;
    accounts.forEach(a=>{
      accHtml += `<tr>
        <td>${a.platform}</td>
        <td>${a.handle}</td>
        <td>${a.label || ''}</td>
        <td>${a.is_active ? 'Active' : 'Inactive'}</td>
        <td><button class="btn btn-secondary" onclick="window.open('${a.url}','_blank')">Open</button></td>
        ${canEdit()?`<td><button class="btn btn-secondary" onclick="openAccountForm(${c.id}, ${a.id}, '${a.platform}', '${a.handle}', '${a.url}', '${a.label || ''}', ${a.is_active})">Edit</button></td>`:''}
      </tr>`;
    });
    accHtml += '</tbody></table>';

    div.innerHTML = `
      <h3>Client: ${c.name}</h3>
      <p class="small">${c.notes || ''}</p>
      ${(c.logo_url ? `<img src="${c.logo_url}" alt="" style="max-width:120px; border-radius:6px; margin-bottom:8px;">`:'')}
      <div class="header">
        <div class="header-title">Accounts</div>
        ${canEdit()?`<button class="btn btn-primary" onclick="openAccountForm(${c.id})">Add Account</button>`:''}
      </div>
      ${accHtml}
    `;
  });
}

function editClient(id){
  if(!canEdit()) return;
  apiGet('/clients/'+id).then(data=>{
    openClientForm(data.client);
  });
}


// ===== Accounts =====
function openAccountForm(clientId, accId, platform, handle, url, label, is_active){
  if(!canEdit()) return;

  const div = document.getElementById('clientDetailContainer');
  const isEdit = !!accId;
  const platVal = platform || '';
  const handVal = handle || '';
  const urlVal = url || '';
  const labelVal = label || '';
  const activeVal = (is_active === undefined || is_active === null) ? 1 : is_active;

  const formHtml = `
    <div class="card" style="margin-top:12px;">
      <h4>${isEdit ? 'Edit Account' : 'Add Account'}</h4>
      <label>Platform</label>
      <select id="af_platform">
        <option value="facebook"  ${platVal==='facebook'?'selected':''}>Facebook</option>
        <option value="instagram" ${platVal==='instagram'?'selected':''}>Instagram</option>
        <option value="tiktok"    ${platVal==='tiktok'?'selected':''}>TikTok</option>
        <option value="snapchat"  ${platVal==='snapchat'?'selected':''}>Snapchat</option>
        <option value="youtube"   ${platVal==='youtube'?'selected':''}>YouTube</option>
        <option value="whatsapp"  ${platVal==='whatsapp'?'selected':''}>WhatsApp</option>
        <option value="telegram"  ${platVal==='telegram'?'selected':''}>Telegram</option>
        <option value="x"         ${platVal==='x'?'selected':''}>X (Twitter)</option>
        <option value="linkedin"  ${platVal==='linkedin'?'selected':''}>LinkedIn</option>
        <option value="pinterest" ${platVal==='pinterest'?'selected':''}>Pinterest</option>
        <option value="threads"   ${platVal==='threads'?'selected':''}>Threads</option>
        <option value="discord"   ${platVal==='discord'?'selected':''}>Discord</option>
        <option value="twitch"    ${platVal==='twitch'?'selected':''}>Twitch</option>
        <option value="other"     ${platVal==='other'?'selected':''}>Other</option>
      </select>
      <label>Handle</label>
      <input id="af_handle" value="${handVal}" />
      <label>URL</label>
      <input id="af_url" value="${urlVal}" />
      <label>Label</label>
      <input id="af_label" value="${labelVal}" />
      <label>Status</label>
      <select id="af_active">
        <option value="1" ${activeVal? 'selected':''}>Active</option>
        <option value="0" ${!activeVal? 'selected':''}>Inactive</option>
      </select>
      <button class="btn btn-primary" onclick="saveAccount(${clientId}, ${accId || 'null'})">Save Account</button>
    </div>
  `;
  div.insertAdjacentHTML('beforeend', formHtml);
}

function saveAccount(clientId, accId){
  if(!canEdit()){
    alert('You do not have permission to modify accounts.');
    return;
  }

  const body = {
    platform: document.getElementById('af_platform').value,
    handle: document.getElementById('af_handle').value,
    url: document.getElementById('af_url').value,
    label: document.getElementById('af_label').value,
    is_active: document.getElementById('af_active').value === '1'
  };
  if(accId){
    apiPut('/social-accounts/'+accId, body).then(()=>{
      viewClient(clientId);
    });
  }else{
    apiPost('/clients/'+clientId+'/social-accounts', body).then(()=>{
      viewClient(clientId);
    });
  }
}


// ===== Users (Owner only) =====
function loadUsers(){
  if(auth.role !== 'owner') return;
  apiGet('/users').then(data=>{
    const div = document.getElementById('usersList');
    let html = '<div class="card"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead><tbody>';
    (data || []).forEach(u=>{
      html += `<tr>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>${u.role}</td>
        <td>
          <button class="btn btn-secondary" onclick="openUserForm(${u.id}, '${u.name}', '${u.email}', '${u.role}')">Edit</button>
          ${u.role!=='owner' ? `<button class="btn btn-danger" onclick="deleteUser(${u.id})">Delete</button>` : ''}
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    div.innerHTML = html;
  });
}

function openUserForm(id, name, email, role){
  if(auth.role !== 'owner') return;
  const div = document.getElementById('userFormContainer');
  div.classList.remove('hidden');
  const isEdit = !!id;
  div.innerHTML = `
    <h3>${isEdit?'Edit User':'Add User'}</h3>
    <label>Name</label>
    <input id="uf_name" value="${name||''}" />
    <label>Email</label>
    <input id="uf_email" value="${email||''}" />
    <label>Password ${isEdit ? '(leave empty to keep)' : ''}</label>
    <input id="uf_password" type="password" />
    <label>Role</label>
    <select id="uf_role">
      <option value="owner" ${role==='owner'?'selected':''}>Owner</option>
      <option value="admin" ${role==='admin'?'selected':''}>Admin</option>
      <option value="user" ${role==='user'?'selected':''}>User</option>
    </select>
    <button class="btn btn-primary" onclick="${isEdit?`saveUser(${id})`:'saveUser()'}">Save</button>
    <button class="btn" onclick="document.getElementById('userFormContainer').classList.add('hidden')">Cancel</button>
  `;
}

function saveUser(id){
  if(auth.role !== 'owner'){
    alert('Only owner can manage users.');
    return;
  }

  const body = {
    name: document.getElementById('uf_name').value,
    email: document.getElementById('uf_email').value,
    password: document.getElementById('uf_password').value,
    role: document.getElementById('uf_role').value
  };
  if(id){
    apiPut('/users/'+id, body).then(()=>{
      document.getElementById('userFormContainer').classList.add('hidden');
      loadUsers();
    });
  }else{
    apiPost('/users', body).then(()=>{
      document.getElementById('userFormContainer').classList.add('hidden');
      loadUsers();
    });
  }
}

function deleteUser(id){
  if(auth.role !== 'owner'){
    alert('Only owner can delete users.');
    return;
  }
  if(!confirm('Delete this user?')) return;
  apiDelete('/users/'+id).then(()=>{
    loadUsers();
  });
}
