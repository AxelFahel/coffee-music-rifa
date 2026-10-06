const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = n => fs.readFileSync(path.join(root, n), 'utf8');
let passed = 0;
function test(name, fn) { fn(); console.log('PASS ' + name); passed++; }
class Sheet {
  constructor(rows = []) { this.rows = rows; }
  getDataRange() { return { getValues: () => this.rows.map(r => [...r]) }; }
  getLastRow() { return this.rows.length; }
  appendRow(row) { this.rows.push([...row]); }
  deleteRow(row) { this.rows.splice(row - 1, 1); }
  getRange(row, col, nr = 1, nc = 1) {
    const self = this;
    const range = {
      setValues(values) { values.forEach((r, i) => r.forEach((v, j) => { self.rows[row - 1 + i] ||= []; self.rows[row - 1 + i][col - 1 + j] = v; })); return range; },
      setValue(v) { return range.setValues([[v]]); },
      setFontWeight() { return range; }, setBackground() { return range; }, setFontColor() { return range; }, setNumberFormat() { return range; }
    }; return range;
  }
  setFrozenRows() {}
}
function backend() {
  let data = {}, cache = new Map(), uploads = [], locked = false;
  const props = { getProperty: k => data[k] ?? null, setProperty(k,v) { data[k] = String(v); return this; }, deleteProperty(k) { delete data[k]; }, setProperties(v) { Object.assign(data,v); } };
  const tables = {
    NUMEROS: new Sheet([['numero','status','reservaId','participanteId','dataReserva','dataExpiracao','dataConfirmacao'], ...Array.from({length:500}, (_,i) => [String(i+1).padStart(3,'0'),'DISPONIVEL','','','','',''])]),
    RESERVAS: new Sheet([['id','participanteId','numeros','quantidade','valorUnitario','valorTotal','status','dataReserva','dataExpiracao','tokenHash']]),
    PARTICIPANTES: new Sheet([['id','nome','whatsapp','email','dataCadastro']]),
    PAGAMENTOS: new Sheet([['id','reservaId','participanteId','valor','comprovanteUrl','status','dataEnvio','dataValidacao','observacao']]),
    CONFIGURACOES: new Sheet([['chave','valor','descricao']]), LOGS: new Sheet([['dataHora','acao','usuario','detalhes']])
  };
  const ss = { getSheetByName: n => tables[n], insertSheet(n) { return tables[n] = new Sheet(); } };
  const folder = { setSharing() {}, getFiles() { let i=0; return { hasNext: () => i<uploads.length, next: () => uploads[i++] }; }, createFile(blob) {
    const f = { blob, access:null, trashed:false, setSharing(a) { this.access=a; }, setTrashed(v) { this.trashed=v; }, getId: () => 'file'+uploads.length, getUrl: () => 'https://drive.google.com/file/d/test/view' }; uploads.push(f); return f;
  } };
  const ctx = vm.createContext({ console, Date, Math, JSON, Number, String, Array, Object, RegExp, Error, isFinite, isNaN,
    PropertiesService: { getScriptProperties: () => props },
    CacheService: { getScriptCache: () => ({ put: (k,v) => cache.set(k,v), get: k => cache.get(k), remove: k => cache.delete(k) }) },
    LockService: { getScriptLock: () => { let owned=false; return { tryLock() { if(locked) return false; locked=true; owned=true; return true; }, waitLock() { if(locked) throw Error('locked'); locked=true; owned=true; }, hasLock: () => owned, releaseLock() { if(owned) { locked=false; owned=false; } } }; } },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset:{UTF_8:'utf8'}, getUuid: () => crypto.randomUUID(), computeDigest: (_,s) => [...crypto.createHash('sha256').update(s).digest()], base64Decode: s => [...Buffer.from(s,'base64')], newBlob: (bytes,mime,name) => ({bytes,mime,name}), formatDate: d => new Date(d).toISOString() },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    DriveApp: { Access: { PRIVATE:'PRIVATE' }, Permission:{ NONE:'NONE' }, getFolderById: () => folder },
    ScriptApp: { getService: () => ({getUrl: () => 'https://script.google.com/macros/s/test/exec'}), getProjectTriggers: () => [], newTrigger: () => ({timeBased() {return this;}, everyMinutes() {return this;}, create() {}}) },
    Logger: {log() {}},
    HtmlService: { XFrameOptionsMode: {DEFAULT:'DEFAULT'}, createTemplateFromFile(name) { return {evaluate() { const t=this; let content=read(name+'.html').replace(/<\?!= include_\('([^']+)'\); \?>/g, (_,file)=>read(file+'.html')).replace(/<\?= serviceUrl \?>/g,t.serviceUrl); return { content, setTitle() {return this;},addMetaTag() {return this;},setXFrameOptionsMode() {return this;} }; }}; } }
  });
  for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.gs'))) vm.runInContext(read(name),ctx,{filename:name});
  props.setProperty('DRIVE_FOLDER_ID','folder');
  return {ctx,props,tables,cache,uploads,folder};
}
function login(b) { b.ctx.definirPin_('Exclusive-test-password-2026'); const r=b.ctx.loginAdmin('Exclusive-test-password-2026'); assert.equal(r.success,true); return r.token; }
function reserve(b, n='001', phone='85999999999', name='Teste Pessoa') { const r=b.ctx.fazerReserva({nome:name,whatsapp:phone,email:'',numeros:[n]}); assert.equal(r.success,true, r.message); return r.reserva; }
const pdf = {mimeType:'application/pdf',base64Data:Buffer.from('%PDF-1.4\nTest').toString('base64')};
function upload(b,r) { return b.ctx.confirmarEnvioComprovante({reservaId:r.id,reservaToken:r.token,filePayload:pdf}); }
test('only explicit RPC endpoints are public; every script parses', () => {
  const expected=['doGet','getPublicData','getNumerosStatus','consultarProtocolo','fazerReserva','confirmarEnvioComprovante','loginAdmin','logoutAdmin','getAdminDashboard','aprovarPagamento','rejeitarPagamento','salvarConfiguracoesAdmin','executarLimpezaManual','setupSistema','configurarSeguranca'].sort();
  let names=[];
  for(const file of fs.readdirSync(root).filter(n=>n.endsWith('.gs'))) { new vm.Script(read(file)); names.push(...[...read(file).matchAll(/^function (\w+)\(/gm)].map(m=>m[1]).filter(n=>!n.endsWith('_'))); }
  assert.deepEqual(names.sort(),expected);
  for(const file of ['scripts.html','admin-scripts.html']) new vm.Script(read(file).replace(/^<script>/,'').replace(/<\/script>\s*$/,''));
});
test('fixed emergency PIN and bare password cannot authorize actions', () => { const b=backend(); login(b); assert.equal(b.ctx.verificarAdminAuth_('coffee2026').autorizado,false); assert.equal(b.ctx.verificarAdminAuth_('Exclusive-test-password-2026').autorizado,false); assert.equal(b.ctx.getAdminDashboard('').unauthorized,true); assert.equal(b.ctx.loginAdmin('coffee2026').success,false); });
test('maintenance endpoints reject anonymous and non-owner callers', () => { const b=backend(); b.ctx.Session={getActiveUser:()=>({getEmail:()=>''}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.com'})}; assert.throws(()=>b.ctx.configurarSeguranca(),/proprietária/);assert.throws(()=>b.ctx.setupSistema(),/proprietária/);b.ctx.Session.getActiveUser=()=>({getEmail:()=> 'visitor@example.com'});assert.throws(()=>b.ctx.configurarSeguranca(),/proprietária/); });
test('Google login issues a session only to the actual project owner', () => { const b=backend(); b.ctx.Session={getActiveUser:()=>({getEmail:()=> 'owner@example.com'}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.com'})};const r=b.ctx.loginAdmin('');assert.equal(r.success,true);assert.equal(b.ctx.verificarAdminAuth_(r.token).autorizado,true);b.ctx.Session.getActiveUser=()=>({getEmail:()=> ''});assert.equal(b.ctx.loginAdmin('').success,false);b.ctx.Session.getActiveUser=()=>({getEmail:()=> 'visitor@example.com'});assert.equal(b.ctx.loginAdmin('').success,false); });
test('session is revoked by logout, password rotation and expiration', () => { const b=backend(); let t=login(b); assert.equal(b.ctx.verificarAdminAuth_(t).autorizado,true); b.ctx.logoutAdmin(t); assert.equal(b.ctx.verificarAdminAuth_(t).autorizado,false); t=login(b); b.ctx.definirPin_('Another-exclusive-password'); assert.equal(b.ctx.verificarAdminAuth_(t).autorizado,false); t=login(b); const key='SESSION_'+b.ctx.hash_(t); const s=JSON.parse(b.cache.get(key)); s.expires=0; b.cache.set(key,JSON.stringify(s)); assert.equal(b.ctx.verificarAdminAuth_(t).autorizado,false); });
test('persistent login rate limit survives session cache eviction', () => {const b=backend(); b.ctx.definirPin_('Exclusive-test-password'); for(let i=0;i<10;i++) assert.equal(b.ctx.loginAdmin('wrong').success,false); b.cache.clear(); assert.match(b.ctx.loginAdmin('Exclusive-test-password').message,/Limite/); });
test('reservation stores a token hash, recalculates value and blocks duplicate ownership', () => {const b=backend(); const r=reserve(b); assert.match(r.token,/^[a-f0-9]{64}$/); assert.equal(b.tables.RESERVAS.rows[1][9],b.ctx.hash_(r.token)); assert.equal(r.valorTotal,20); assert.equal(b.ctx.fazerReserva({nome:'Outro',whatsapp:'85988888888',numeros:['001'],valorTotal:0}).success,false); });
test('three active reservations per phone and 20 numbers per request', () => {const b=backend(); reserve(b,'001');reserve(b,'002');reserve(b,'003');assert.equal(b.ctx.fazerReserva({nome:'Teste Pessoa',whatsapp:'85999999999',numeros:['004']}).success,false); assert.equal(b.ctx.fazerReserva({nome:'Teste Pessoa',whatsapp:'85988888888',numeros:Array.from({length:21},(_,i)=>String(i+20))}).success,false); });
test('formula-like participant fields are stored as text', () => {const b=backend(); reserve(b,'001','85999999999','=HYPERLINK("test")'); assert.ok(b.tables.PARTICIPANTES.rows[1][1].startsWith("'=")); assert.ok(b.tables.LOGS.rows[1][2].startsWith("'=")); });
test('wrong upload token does not create files or mutate reservation', () => {const b=backend();const r=reserve(b); const result=b.ctx.confirmarEnvioComprovante({reservaId:r.id,reservaToken:'a'.repeat(64),filePayload:pdf});assert.equal(result.success,false);assert.equal(b.uploads.length,0);assert.equal(b.tables.RESERVAS.rows[1][6],'RESERVADO'); });
test('upload is private; duplicate upload creates no extra files or payments', () => {const b=backend();const r=reserve(b);assert.equal(upload(b,r).success,true);assert.equal(b.uploads[0].access,'PRIVATE');assert.equal(upload(b,r).success,false);assert.equal(b.uploads.length,1);assert.equal(b.tables.PAGAMENTOS.rows.length,2); });
test('expired and reassigned numbers reject upload before file creation', () => {const b=backend();const r=reserve(b);b.tables.NUMEROS.rows[1][2]='OTHER';assert.equal(upload(b,r).success,false);assert.equal(b.uploads.length,0); b.tables.NUMEROS.rows[1][2]=r.id;b.tables.RESERVAS.rows[1][8]='2000-01-01';assert.equal(upload(b,r).success,false); });
test('spoofed MIME and oversized Base64 are rejected', () => {const b=backend(); assert.throws(()=>b.ctx.salvarComprovanteDrive_({mimeType:'image/png',base64Data:pdf.base64Data},'Teste',['001']),/conteúdo/);assert.throws(()=>b.ctx.salvarComprovanteDrive_({mimeType:'application/pdf',base64Data:'A'.repeat(11200001)},'Teste',['001']),/8MB/);assert.equal(b.uploads.length,0); });
test('approval validates payment/reservation relationship and cannot be repeated', () => {const b=backend();const t=login(b);const r=reserve(b);upload(b,r);const p=b.tables.PAGAMENTOS.rows[1][0]; assert.equal(b.ctx.aprovarPagamento(t,p,'OTHER').success,false);assert.equal(b.tables.PAGAMENTOS.rows[1][5],'AGUARDANDO_VALIDACAO');assert.equal(b.ctx.aprovarPagamento(t,p,r.id).success,true);assert.equal(b.tables.NUMEROS.rows[1][1],'CONFIRMADO');assert.equal(b.ctx.rejeitarPagamento(t,p,r.id,'teste','LIBERAR').success,false);assert.equal(b.tables.NUMEROS.rows[1][1],'CONFIRMADO'); });
test('rejected released reservation cannot overwrite a new owner', () => {const b=backend();const t=login(b);const old=reserve(b);upload(b,old);const p=b.tables.PAGAMENTOS.rows[1][0];assert.equal(b.ctx.rejeitarPagamento(t,p,old.id,'Inválido','LIBERAR').success,true);const next=reserve(b,'001','85988888888');assert.equal(upload(b,old).success,false);assert.equal(b.ctx.aprovarPagamento(t,p,old.id).success,false);assert.equal(b.tables.NUMEROS.rows[1][2],next.id);assert.equal(b.tables.NUMEROS.rows[1][1],'RESERVADO'); });
test('configuration rejects bad values before writing and never logs new password', () => {const b=backend();const t=login(b);const cfg={chavePix:'test@example.com',nomeFavorecido:'Teste',cidadePix:'Fortaleza',whatsappContato:'5585999999999',valorNumero:-2,tempoReservaMinutos:15};assert.equal(b.ctx.salvarConfiguracoesAdmin(t,cfg).success,false);assert.equal(b.tables.CONFIGURACOES.rows.length,1);cfg.valorNumero=30;cfg.adminPin='Another-private-password';assert.equal(b.ctx.salvarConfiguracoesAdmin(t,cfg).success,true);assert.equal(b.ctx.verificarAdminAuth_(t).autorizado,false);assert.ok(!JSON.stringify(b.tables.LOGS.rows).includes(cfg.adminPin));assert.equal(b.props.getProperty('adminPin'),null); });
test('migration removes legacy PIN/log secrets and privatizes old files', () => {const b=backend();b.props.setProperty('ADMIN_NEW_PIN','New-private-password-2026');b.props.setProperty('adminPin','old');b.tables.CONFIGURACOES.appendRow(['adminPin','old']);b.tables.LOGS.appendRow(['date','CONFIGURACOES_ATUALIZADAS','ADMIN','old password']);b.folder.createFile({}).access='ANYONE_WITH_LINK';b.ctx.migrarSeguranca_();assert.equal(b.props.getProperty('adminPin'),null);assert.equal(b.props.getProperty('ADMIN_NEW_PIN'),null);assert.equal(b.tables.CONFIGURACOES.rows.length,1);assert.ok(!JSON.stringify(b.tables.LOGS.rows).includes('old password'));assert.equal(b.uploads[0].access,'PRIVATE');assert.equal(b.ctx.loginAdmin('New-private-password-2026').success,true); });
test('rendered navigation uses deployment URL in a new tab; no cross-origin top reads', () => {const b=backend();const admin=b.ctx.doGet({parameter:{pagina:'admin'}}).content;const pub=b.ctx.doGet({parameter:{}}).content;assert.match(admin,/href="https:\/\/script.google.com\/macros\/s\/test\/exec\?pagina=index" target="_blank"/);assert.match(pub,/href="https:\/\/script.google.com\/macros\/s\/test\/exec\?pagina=admin" target="_blank"/);assert.ok(!admin.includes('window.top.location'));assert.ok(!pub.includes('window.top.location'));assert.ok(!admin.includes('<?')); });
class Element {
  constructor(){this.children=[];this.style={};this.classList={add(){},remove(){}};this.textContent='';this.value='';}
  appendChild(child){this.children.push(child);child.parentNode=this;return child;}
  addEventListener(){}
  set innerHTML(value){if(value) throw Error('Unexpected HTML insertion: '+value);this.children=[];}
}
test('malicious participant/log/toast content remains plain text and dangerous URLs are rejected', () => {
  const els={};const doc={getElementById: id=>els[id] ||= new Element(),createElement:()=>new Element(),addEventListener(){}};
  const ctx=vm.createContext({document:doc,sessionStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){}},console,setTimeout(){},URL});
  vm.runInContext(read('admin-scripts.html').replace(/^<script>/,'').replace(/<\/script>\s*$/,''),ctx);
  const evil='<img src=x onerror=alert(1)>';
  ctx.renderizarTabelaPendentes([{nome:evil,numeros:['001'],whatsappLimpo:'85999999999',whatsapp:evil,comprovanteUrl:'javascript:alert(1)',pagamentoId:evil,reservaId:evil}]);
  assert.equal(els['tbody-pendentes'].children[0].children[1].textContent,evil);
  assert.equal(els['tbody-pendentes'].children[0].children[6].textContent,'Link indisponível');
  ctx.renderizarLogs([{acao:evil,usuario:evil,detalhes:evil}]);ctx.showToast(evil,'error');
  assert.equal(els['tbody-logs'].children[0].children[1].textContent,evil);
});
console.log(`\n${passed} security/regression tests passed.`);
