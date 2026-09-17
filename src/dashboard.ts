import type { FastifyInstance } from 'fastify';

export function registerDashboard(app: FastifyInstance): void {
  app.get('/', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return dashboardHtml;
  });
}

const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>ZERO Farmer</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f6f7f9;background:#0a0b0d}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#171a20,#0a0b0d 44%);min-height:100vh}.shell{max-width:1500px;margin:auto;padding:28px}.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}.brand{font-weight:800;letter-spacing:.18em}.sub{color:#8f98a8;font-size:13px}.pill{border:1px solid #2a3039;background:#12151a;border-radius:999px;padding:8px 12px;color:#a9b3c3;font-size:12px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.card{background:rgba(19,22,27,.88);border:1px solid #242a32;border-radius:18px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.22)}.metric{font-size:30px;font-weight:800;margin-top:8px}.label{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#8993a2}.wide{grid-column:span 2}.full{grid-column:1/-1}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{text-align:left;padding:11px;border-bottom:1px solid #222831;font-size:13px}th{color:#8f98a8;font-weight:600}button{background:#f0f3f6;color:#0a0b0d;border:0;border-radius:10px;padding:8px 11px;font-weight:700;cursor:pointer;margin-right:6px}.danger{background:#392028;color:#ffb4c2}.ok{color:#76e0a2}.warn{color:#ffc76b}.bad{color:#ff7d91}@media(max-width:900px){.grid{grid-template-columns:1fr 1fr}.wide{grid-column:span 2}}@media(max-width:600px){.grid{grid-template-columns:1fr}.wide,.full{grid-column:span 1}.shell{padding:16px}}
</style>
</head>
<body><main class="shell"><div class="top"><div><div class="brand">ZERO FARMER</div><div class="sub">Physical iOS Agent Fleet Control Plane</div></div><div class="pill" id="stamp">connecting</div></div><section class="grid"><div class="card"><div class="label">Devices</div><div class="metric" id="devices">—</div></div><div class="card"><div class="label">Online</div><div class="metric" id="online">—</div></div><div class="card"><div class="label">Runs</div><div class="metric" id="runs">—</div></div><div class="card"><div class="label">Failed</div><div class="metric" id="failed">—</div></div><div class="card full"><div class="label">Fleet</div><table><thead><tr><th>Device</th><th>iOS</th><th>Health</th><th>UDID</th><th>Appium/WDA</th><th>Actions</th></tr></thead><tbody id="fleet"></tbody></table></div><div class="card full"><div class="label">Recent Runs</div><table><thead><tr><th>Run</th><th>Workflow</th><th>Device</th><th>Status</th><th>Created</th></tr></thead><tbody id="runRows"></tbody></table></div></section></main>
<script>
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const statusClass=s=>s==='online'||s==='succeeded'?'ok':s==='failed'||s==='quarantined'||s==='offline'?'bad':'warn';
async function api(path,init){const key=localStorage.getItem('zeroFarmerApiKey');const headers={...(init?.headers||{})};if(key)headers['x-api-key']=key;const r=await fetch(path,{...init,headers});if(r.status===401&&!key){const entered=prompt('ZERO Farmer API key');if(entered){localStorage.setItem('zeroFarmerApiKey',entered);return api(path,init)}}if(!r.ok)throw new Error(await r.text());return r.json()}
async function action(id,type){await api('/api/v1/devices/'+encodeURIComponent(id)+'/'+type,{method:'POST'});await refresh()}
async function refresh(){try{const [f,d,r]=await Promise.all([api('/api/v1/fleet'),api('/api/v1/devices'),api('/api/v1/runs')]);devices.textContent=f.devices.total;online.textContent=f.devices.online;runs.textContent=f.runs.total;failed.textContent=f.runs.failed;fleet.innerHTML=d.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.iosVersion||'—')+'</td><td class="'+statusClass(x.health)+'">'+esc(x.health)+'</td><td>'+esc(x.udid)+'</td><td>'+esc(x.appiumPort||'—')+' / '+esc(x.wdaPort||'—')+'</td><td><button class="danger" onclick="action(\''+esc(x.id)+'\',\'quarantine\')">Quarantine</button><button onclick="action(\''+esc(x.id)+'\',\'restore\')">Restore</button></td></tr>').join('');runRows.innerHTML=r.slice().reverse().slice(0,50).map(x=>'<tr><td>'+esc(x.id)+'</td><td>'+esc(x.workflowId)+' v'+esc(x.workflowVersion)+'</td><td>'+esc(x.deviceId||'—')+'</td><td class="'+statusClass(x.status)+'">'+esc(x.status)+'</td><td>'+esc(x.createdAt)+'</td></tr>').join('');stamp.textContent='updated '+new Date().toLocaleTimeString()}catch(e){stamp.textContent='control plane unavailable'}}
refresh();setInterval(refresh,5000);
</script></body></html>`;
