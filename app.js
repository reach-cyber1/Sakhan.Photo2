const SV = {
    Copy: 'ថតចម្លង',
    Print: 'បោះពុម្ព',
    'Take a Photo': 'ថតរូប',
    Design: 'រចនា',
    Other: 'ផ្សេងៗ'
}
  , CU = ['KHR', 'USD'];
const $ = i => document.getElementById(i)
  , esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  , pad = n => String(n).padStart(2, '0');
const dk = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  , nowL = () => {
    const d = new Date();
    return dk(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}
;
const fm = (a, c) => c == 'KHR' ? Math.round(a).toLocaleString('en-US') + ' ៛' : '$' + (+a).toFixed(2);
const toast = m => {
    const t = $('t');
    t.textContent = m;
    t.style.display = 'block';
    setTimeout( () => t.style.display = 'none', 2500)
}
;
let db, TX = [], EX = [], page = 'dash', editId = null, rp = 'today', ra = '', rb = '', q = '', authed = false;
/* ---- storage ---- */
const open = () => new Promise( (ok, no) => {
    const r = indexedDB.open('sakhan-photo', 1);
    r.onupgradeneeded = () => ['meta', 'tx', 'exp'].forEach(s => r.result.createObjectStore(s, {
        keyPath: 'id'
    }));
    r.onsuccess = () => {
        db = r.result;
        ok()
    }
    ;
    r.onerror = () => no(r.error)
}
);
const st = (s, m='readonly') => db.transaction(s, m).objectStore(s)
  , rq = r => new Promise( (ok, no) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error)
}
);
const all = s => rq(st(s).getAll())
  , put = (s, o) => rq(st(s, 'readwrite').put(o))
  , del = (s, i) => rq(st(s, 'readwrite').delete(i))
  , get = (s, i) => rq(st(s).get(i))
  , clr = s => rq(st(s, 'readwrite').clear());
const reload = async () => {
    TX = (await all('tx')).sort( (a, b) => b.dt.localeCompare(a.dt));
    EX = (await all('exp')).sort( (a, b) => b.dt.localeCompare(a.dt))
}
;
/* ---- auth (PBKDF2 hash + random salt; no default password) ---- */
const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a)))
  , unb = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function hash(pw, salt) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt,
        iterations: 200000,
        hash: 'SHA-256'
    }, k, 256))
}
async function mkOwner(user, pw) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    await put('meta', {
        id: 'owner',
        user,
        salt: b64(salt),
        hash: await hash(pw, salt)
    })
}
async function showLogin() {
    authed = false;
    TX = [];
    EX = [];
    const o = await get('meta', 'owner')
      , first = !o;
    $('app').innerHTML = `<div class=login><div class=card><div class=ic>📷</div><h2 style="text-align:center">Sakhan Photo</h2>
<p style="text-align:center;margin-top:0">${first ? 'បង្កើតគណនីម្ចាស់ជាលើកដំបូង<br>Create owner account' : 'ចូលប្រើប្រាស់ Login'}</p>
<form onsubmit="doLogin(event,${first})"><label>ឈ្មោះអ្នកប្រើ Username<input id=u autocomplete=username maxlength=30 required></label><br>
<label>ពាក្យសម្ងាត់ Password<input id=p type=password autocomplete=${first ? 'new-password' : 'current-password'} required></label>
<label style="margin:6px 0"><input type=checkbox style="width:auto" onchange="$('p').type=this.checked?'text':'password'"> បង្ហាញ Show</label>
${first ? '<label>បញ្ជាក់ពាក្យសម្ងាត់ Confirm<input id=p2 type=password required></label>' : ''}
<button class=btn style="width:100%;margin-top:10px">${first ? 'បង្កើត Create' : 'ចូល Login'}</button></form>
<p class=note>⚠ Browser login only hides the screen. Data is stored on this computer without encryption: protect Windows with a password/BitLocker.</p>
${first ? '' : '<a href="#" class=note onclick="resetAll();return false">ភ្លេចពាក្យសម្ងាត់? Forgot password?</a>'}</div></div>`
}
async function doLogin(e, first) {
    e.preventDefault();
    if (!crypto.subtle)
        return alert('Please open in Chrome or Edge');
    const u = $('u').value.trim()
      , p = $('p').value;
    if (first) {
        if (!/^[\w.-]{3,30}$/.test(u))
            return alert('Username 3-30 letters/numbers');
        if (p.length < 8)
            return alert('Password must be at least 8 characters');
        if (p !== $('p2').value)
            return alert('Passwords do not match');
        await mkOwner(u, p)
    } else {
        const o = await get('meta', 'owner');
        await new Promise(r => setTimeout(r, 800));
        if (u !== o.user || await hash(p, unb(o.salt)) !== o.hash)
            return alert('ឈ្មោះ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ / Wrong username or password')
    }
    authed = true;
    await reload();
    go('dash')
}
async function resetAll() {
    if (!confirm('Reset password = DELETE ALL business data on this computer (transactions, expenses, account). You can then restore from a JSON backup. Continue?'))
        return;
    if (prompt('Type RESET to confirm') !== 'RESET')
        return;
    for (const s of ['meta', 'tx', 'exp'])
        await clr(s);
    showLogin()
}
/* ---- dates & summaries ---- */
function range(p, a, b) {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const ad = (d, n) => {
        const x = new Date(d);
        x.setDate(x.getDate() + n);
        return x
    }
      , ws = ad(t, -((t.getDay() + 6) % 7))
      , y = t.getFullYear()
      , mo = t.getMonth();
    const m = {
        today: [t, t],
        yesterday: [ad(t, -1), ad(t, -1)],
        week: [ws, ad(ws, 6)],
        lastweek: [ad(ws, -7), ad(ws, -1)],
        month: [new Date(y,mo,1), new Date(y,mo + 1,0)],
        lastmonth: [new Date(y,mo - 1,1), new Date(y,mo,0)]
    };
    if (p == 'all')
        return ['0000-00-00', '9999-99-99'];
    if (p == 'custom')
        return [a || '0000-00-00', b || '9999-99-99'];
    return m[p].map(dk)
}
const inR = (L, p) => {
    const [a,b] = range(p, ra, rb);
    return L.filter(x => x.dt.slice(0, 10) >= a && x.dt.slice(0, 10) <= b)
}
;
function sum(L) {
    const r = {
        v: 0,
        n: 0,
        rev: {
            KHR: 0,
            USD: 0
        },
        un: {
            KHR: 0,
            USD: 0
        },
        svc: {},
        day: {},
        mon: {}
    };
    L.forEach(x => {
        const d = x.dt.slice(0, 10)
          , c = x.cur
          , a = +x.total
          , v = +x.visitors;
        r.v += v;
        r.n++;
        const s = r.svc[x.svc] ??= {
            n: 0,
            v: 0,
            KHR: 0,
            USD: 0
        }
          , dd = r.day[d] ??= {
            v: 0,
            n: 0,
            KHR: 0,
            USD: 0
        }
          , mm = r.mon[d.slice(0, 7)] ??= {
            v: 0,
            n: 0,
            KHR: 0,
            USD: 0
        };
        s.n++;
        s.v += v;
        dd.n++;
        dd.v += v;
        mm.n++;
        mm.v += v;
        if (x.paid) {
            r.rev[c] += a;
            s[c] += a;
            dd[c] += a;
            mm[c] += a
        } else
            r.un[c] += a
    }
    );
    return r
}
const exSum = E => {
    const r = {
        KHR: 0,
        USD: 0
    };
    E.forEach(x => r[x.cur] += +x.amount);
    return r
}
;
/* ---- UI ---- */
const NAV = [['dash', '📊 ផ្ទាំងគ្រប់គ្រង Dashboard'], ['add', '➕ បន្ថែមប្រតិបត្តិការ Add'], ['hist', '🧾 ប្រវត្តិ History'], ['svc', '🛠 សេវាកម្ម Services'], ['exp', '💸 ចំណាយ Expenses'], ['r:today', '📅 ប្រចាំថ្ងៃ Daily'], ['r:week', '📆 ប្រចាំសប្តាហ៍ Weekly'], ['r:month', '🗓 ប្រចាំខែ Monthly'], ['bak', '💾 បម្រុងទុក Backup'], ['set', '⚙ ការកំណត់ Settings'], ['out', '🔒 ចាកចេញ Logout']];
async function go(p) {
    if (!authed)
        return showLogin();
    if (p == 'out')
        return showLogin();
    if (p != 'add')
        editId = null;
    if (p.startsWith('r:')) {
        rp = p.slice(2);
        page = 'rep'
    } else
        page = p;
    await reload();
    draw()
}
function draw() {
    const key = page == 'rep' ? 'r:' + rp : page;
    const body = {
        dash,
        add,
        hist,
        svc,
        exp,
        rep,
        bak,
        set
    }[page]();
    $('app').innerHTML = `<nav><h1>📷 Sakhan Photo</h1>${NAV.map( ([k,l]) => `<a class="${k == key ? 'on' : ''} ${k == 'out' ? 'lo' : ''}" onclick="go('${k}')">${l}</a>`).join('')}</nav><main>${body}</main>`;
    if (page == 'rep')
        $('custom').style.display = rp == 'custom' ? 'flex' : 'none'
}
const card = (t, v, c='') => `<div class="stat ${c}"><small>${t}</small><b>${v}</b></div>`
  , tbl = (h, r) => `<div class=tw><table><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr>${r.join('') || `<tr><td colspan=${h.length}>មិនទាន់មានទិន្នន័យ No data yet</td></tr>`}</table></div>`;
const both = o => fm(o.KHR, 'KHR') + '<br>' + fm(o.USD, 'USD');
function dash() {
    const t = sum(inR(TX, 'today'))
      , w = sum(inR(TX, 'week'))
      , m = sum(inR(TX, 'month'));
    return `<h2>ផ្ទាំងគ្រប់គ្រង Dashboard</h2><div class=grid>${card('អ្នកមកថ្ងៃនេះ Visitors today', t.v) + card('សេវាបានបញ្ចប់ថ្ងៃនេះ Services today', t.n) + card('ចំណូលថ្ងៃនេះ Revenue today (៛)', fm(t.rev.KHR, 'KHR'), 'g') + card('ចំណូលថ្ងៃនេះ Revenue today ($)', fm(t.rev.USD, 'USD'), 'g') + card('អ្នកមកសប្តាហ៍នេះ Visitors this week', w.v) + card('ចំណូលសប្តាហ៍នេះ Revenue this week', both(w.rev), 'g') + card('ចំណូលខែនេះ Revenue this month', both(m.rev), 'g') + card('មិនទាន់បង់ Unpaid (today)', both(t.un), 'r')}</div>`
}
function add() {
    const x = TX.find(t => t.id == editId) || {
        dt: nowL(),
        svc: 'Copy',
        visitors: 1,
        cur: 'KHR',
        paid: true
    };
    return `<h2>${editId ? 'កែប្រែ Edit' : 'បន្ថែម Add'} ប្រតិបត្តិការ Transaction</h2><form class=card onsubmit="saveTx(event)"><div class=fg>
<label>ឈ្មោះអតិថិជន Customer (optional)<input id=f_name value="${esc(x.name)}" maxlength=80></label>
<label>កាលបរិច្ឆេទ Date/time *<input id=f_dt type=datetime-local required value="${x.dt}"></label>
<label>សេវា Service *<select id=f_svc>${Object.keys(SV).map(k => `<option value="${k}" ${k == x.svc ? 'selected' : ''}>${k} — ${SV[k]}</option>`).join('')}</select></label>
<label>ចំនួនអតិថិជន Visitors *<input id=f_vis type=number min=0 step=1 value="${x.visitors}"></label>
<label>ចំនួនសន្លឹក/ចំនួន Qty<input id=f_qty type=number min=0 step=any value="${x.qty ?? ''}" oninput=calc()></label>
<label>តម្លៃ/ឯកតា Price per unit<input id=f_price type=number min=0 step=any value="${x.price ?? ''}" oninput=calc()></label>
<label>សរុប Total *<input id=f_total type=number min=0 step=any required value="${x.total ?? ''}"></label>
<label>រូបិយប័ណ្ណ Currency<select id=f_cur>${CU.map(c => `<option ${c == x.cur ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
<label>ការទូទាត់ Payment<select id=f_paid><option value=1 ${x.paid ? 'selected' : ''}>Paid បានបង់</option><option value=0 ${x.paid ? '' : 'selected'}>Unpaid មិនទាន់បង់</option></select></label></div>
<label>កំណត់ចំណាំ Notes<textarea id=f_note maxlength=300>${esc(x.note)}</textarea></label><button class=btn>រក្សាទុក Save</button>${editId ? `<button type=button class="btn x" onclick="go('hist')">បោះបង់ Cancel</button>` : ''}</form>`
}
function calc() {
    const a = +$('f_qty').value
      , b = +$('f_price').value;
    if (a > 0 && b > 0)
        $('f_total').value = Math.round(a * b * 100) / 100
}
async function saveTx(e) {
    e.preventDefault();
    const v = i => $(i).value
      , n = i => v(i) === '' ? null : +v(i);
    const o = {
        id: editId || uid(),
        name: v('f_name').trim(),
        dt: v('f_dt'),
        svc: v('f_svc'),
        visitors: n('f_vis'),
        qty: n('f_qty'),
        price: n('f_price'),
        total: n('f_total'),
        cur: v('f_cur'),
        paid: v('f_paid') == '1',
        note: v('f_note').trim()
    };
    if (!o.dt || !Number.isInteger(o.visitors) || o.visitors < 0 || !(o.total >= 0) || !SV[o.svc] || !CU.includes(o.cur) || (o.qty !== null && o.qty < 0) || (o.price !== null && o.price < 0))
        return alert('សូមពិនិត្យទិន្នន័យ Please check the inputs');
    o.total = o.cur == 'KHR' ? Math.round(o.total) : Math.round(o.total * 100) / 100;
    await put('tx', o);
    toast('✔ Saved');
    go('hist')
}
function hist() {
    const s = q.toLowerCase()
      , L = TX.filter(x => !s || (x.name + ' ' + x.note + ' ' + x.svc + ' ' + SV[x.svc]).toLowerCase().includes(s));
    return `<h2>ប្រវត្តិ Transaction History</h2><div class=card><input placeholder="🔍 ស្វែងរក Search..." value="${esc(q)}" oninput="q=this.value;draw();const i=document.querySelector('main input');i.focus();i.setSelectionRange(q.length,q.length)">` + tbl(['Date', 'Customer', 'Service', 'Visitors', 'Qty', 'Price', 'Total', 'Status', 'Notes', ''], L.map(x => `<tr><td>${x.dt.replace('T', ' ')}</td><td>${esc(x.name)}</td><td>${x.svc} ${SV[x.svc]}</td><td>${x.visitors}</td><td>${x.qty ?? ''}</td><td>${x.price ?? ''}</td><td>${fm(x.total, x.cur)}</td><td class=${x.paid ? 'pos' : 'neg'}>${x.paid ? 'Paid' : 'Unpaid'}</td><td>${esc(x.note)}</td><td><button class="btn s" onclick="editId='${x.id}';go('add')">កែ</button><button class="btn s d" onclick="delTx('${x.id}')">លុប</button></td></tr>`)) + '</div>'
}
async function delTx(i) {
    if (confirm('លុបប្រតិបត្តិការនេះ? Delete this transaction?')) {
        await del('tx', i);
        toast('Deleted');
        go('hist')
    }
}
function svc() {
    const s = sum(TX);
    return `<h2>សេវាកម្ម Services</h2><div class=card>` + tbl(['Service', 'Customers', 'Transactions', 'Revenue ៛', 'Revenue $'], Object.keys(SV).map(k => {
        const x = s.svc[k] || {
            n: 0,
            v: 0,
            KHR: 0,
            USD: 0
        };
        return `<tr><td>${k} — ${SV[k]}</td><td>${x.v}</td><td>${x.n}</td><td>${fm(x.KHR, 'KHR')}</td><td>${fm(x.USD, 'USD')}</td></tr>`
    }
    )) + `<p class=note>All time, received revenue only.</p></div>`
}
function exp() {
    const x = EX.find(t => t.id == editId) || {
        dt: nowL().slice(0, 10),
        cur: 'KHR'
    };
    return `<h2>ចំណាយ Expenses</h2><form class=card onsubmit="saveEx(event)"><div class=fg><label>ឈ្មោះ Name *<input id=e_n required maxlength=80 value="${esc(x.name)}"></label>
<label>ប្រភេទ Category<input id=e_c list=cats maxlength=40 value="${esc(x.cat)}"><datalist id=cats><option>Paper<option>Ink<option>Rent<option>Electricity<option>Equipment</datalist></label>
<label>កាលបរិច្ឆេទ Date *<input id=e_d type=date required value="${x.dt.slice(0, 10)}"></label><label>ចំនួនទឹកប្រាក់ Amount *<input id=e_a type=number min=0 step=any required value="${x.amount ?? ''}"></label>
<label>រូបិយប័ណ្ណ Currency<select id=e_u>${CU.map(c => `<option ${c == x.cur ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label>កំណត់ចំណាំ Notes<input id=e_t maxlength=200 value="${esc(x.note)}"></label></div>
<button class=btn>រក្សាទុក Save</button></form><div class=card>` + tbl(['Date', 'Name', 'Category', 'Amount', 'Notes', ''], EX.map(x => `<tr><td>${x.dt.slice(0, 10)}</td><td>${esc(x.name)}</td><td>${esc(x.cat)}</td><td class=neg>${fm(x.amount, x.cur)}</td><td>${esc(x.note)}</td><td><button class="btn s" onclick="editId='${x.id}';draw()">កែ</button><button class="btn s d" onclick="delEx('${x.id}')">លុប</button></td></tr>`)) + '</div>'
}
async function saveEx(e) {
    e.preventDefault();
    const a = +$('e_a').value
      , u = $('e_u').value;
    if (!(a >= 0) || !CU.includes(u) || !$('e_n').value.trim())
        return alert('Check inputs');
    await put('exp', {
        id: editId || uid(),
        name: $('e_n').value.trim(),
        cat: $('e_c').value.trim(),
        dt: $('e_d').value,
        amount: u == 'KHR' ? Math.round(a) : Math.round(a * 100) / 100,
        cur: u,
        note: $('e_t').value.trim()
    });
    editId = null;
    toast('✔ Saved');
    go('exp')
}
async function delEx(i) {
    if (confirm('Delete this expense?')) {
        await del('exp', i);
        go('exp')
    }
}
function rep() {
    const [a,b] = range(rp, ra, rb)
      , L = inR(TX, rp)
      , E = EX.filter(x => x.dt.slice(0, 10) >= a && x.dt.slice(0, 10) <= b)
      , s = sum(L)
      , x = exSum(E)
      , pr = {
        KHR: s.rev.KHR - x.KHR,
        USD: s.rev.USD - x.USD
    };
    const P = [['today', 'ថ្ងៃនេះ Today'], ['yesterday', 'ម្សិលមិញ Yesterday'], ['week', 'សប្តាហ៍នេះ This week'], ['lastweek', 'សប្តាហ៍មុន Last week'], ['month', 'ខែនេះ This month'], ['lastmonth', 'ខែមុន Last month'], ['custom', 'កំណត់ Custom'], ['all', 'ទាំងអស់ All time']];
    const days = Object.keys(s.day).sort()
      , mx = Math.max(1, ...days.map(d => s.day[d].KHR))
      , pc = o => `<span class=${o.KHR >= 0 ? 'pos' : 'neg'}>${fm(o.KHR, 'KHR')}</span><br><span class=${o.USD >= 0 ? 'pos' : 'neg'}>${fm(o.USD, 'USD')}</span>`;
    return `<h2>របាយការណ៍ Reports</h2><div class=card><select onchange="rp=this.value;draw()">${P.map( ([k,l]) => `<option value=${k} ${k == rp ? 'selected' : ''}>${l}</option>`).join('')}</select>
<div id=custom class=fg style="display:none;margin-top:8px"><label>From<input type=date value="${ra}" onchange="ra=this.value;draw()"></label><label>To<input type=date value="${rb}" onchange="rb=this.value;draw()"></label></div></div>
<div class=grid>${card('អ្នកមក Visitors', s.v) + card('ប្រតិបត្តិការ Transactions', s.n) + card('ចំណូលទទួលបាន Received', both(s.rev), 'g') + card('មិនទាន់បង់ Unpaid', both(s.un), 'r') + card('ចំណាយ Expenses', both(x), 'r')}<div class=stat><small>ប្រាក់ចំណេញ Profit (Revenue − Expenses)</small><b>${pc(pr)}</b></div></div><br>
<div class=card><b>តាមសេវា By service</b>${tbl(['Service', 'Customers', 'Transactions', 'Revenue ៛', 'Revenue $'], Object.keys(SV).map(k => {
        const v = s.svc[k] || {
            n: 0,
            v: 0,
            KHR: 0,
            USD: 0
        };
        return `<tr><td>${k} ${SV[k]}</td><td>${v.v}</td><td>${v.n}</td><td>${fm(v.KHR, 'KHR')}</td><td>${fm(v.USD, 'USD')}</td></tr>`
    }
    ))}</div>
<div class=card><b>ប្រចាំថ្ងៃ Daily trend</b>${tbl(['Date', 'Visitors', 'Trans.', 'Revenue ៛', 'Revenue $', '៛ trend'], days.map(d => {
        const v = s.day[d];
        return `<tr><td>${d}</td><td>${v.v}</td><td>${v.n}</td><td>${fm(v.KHR, 'KHR')}</td><td>${fm(v.USD, 'USD')}</td><td style="width:140px"><i class=bar style="width:${v.KHR / mx * 100}%"></i></td></tr>`
    }
    ))}</div>
<div class=card><b>ប្រចាំខែ Monthly summary</b>${tbl(['Month', 'Visitors', 'Trans.', 'Revenue ៛', 'Revenue $'], Object.keys(s.mon).sort().map(d => {
        const v = s.mon[d];
        return `<tr><td>${d}</td><td>${v.v}</td><td>${v.n}</td><td>${fm(v.KHR, 'KHR')}</td><td>${fm(v.USD, 'USD')}</td></tr>`
    }
    ))}</div>
<div class=card><b>ប្រតិបត្តិការ Transactions</b>${tbl(['Date', 'Customer', 'Service', 'Visitors', 'Total', 'Status'], L.map(t => `<tr><td>${t.dt.replace('T', ' ')}</td><td>${esc(t.name)}</td><td>${t.svc}</td><td>${t.visitors}</td><td>${fm(t.total, t.cur)}</td><td class=${t.paid ? 'pos' : 'neg'}>${t.paid ? 'Paid' : 'Unpaid'}</td></tr>`))}</div>`
}
/* ---- backup ---- */
const dl = (name, txt, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt],{
        type
    }));
    a.download = name;
    a.click();
    setTimeout( () => URL.revokeObjectURL(a.href), 1000)
}
;
const exJSON = () => dl(`sakhan-backup-${dk(new Date())}.json`, JSON.stringify({
    app: 'sakhan-photo',
    version: 1,
    exportedAt: new Date().toISOString(),
    tx: TX,
    exp: EX
}, null, 1), 'application/json');
function exCSV() {
    const c = v => '"' + String(v ?? '').replace(/"/g, '""') + '"'
      , r = [['Date', 'Customer', 'Service', 'Visitors', 'Qty', 'Price', 'Total', 'Currency', 'Status', 'Notes'].map(c).join(',')];
    TX.forEach(x => r.push([x.dt.replace('T', ' '), x.name, x.svc, x.visitors, x.qty, x.price, x.total, x.cur, x.paid ? 'Paid' : 'Unpaid', x.note].map(c).join(',')));
    dl(`sakhan-transactions-${dk(new Date())}.csv`, '\uFEFF' + r.join('\r\n'), 'text/csv;charset=utf-8')
}
const D8 = /^\d{4}-\d\d-\d\d/
  , ok1 = x => x && typeof x.id == 'string' && D8.test(x.dt) && CU.includes(x.cur);
const valid = d => d && d.app == 'sakhan-photo' && Array.isArray(d.tx) && Array.isArray(d.exp) && d.tx.every(x => ok1(x) && SV[x.svc] && x.total >= 0 && Number.isInteger(+x.visitors)) && d.exp.every(x => ok1(x) && x.amount >= 0);
async function imp(f) {
    if (!f)
        return;
    let d;
    try {
        d = JSON.parse(await f.text())
    } catch {
        return alert('❌ Not a valid JSON file')
    }
    if (!valid(d))
        return alert('❌ Not a valid Sakhan Photo backup. Nothing was imported.');
    const rep = $('mode').value == 'replace';
    if (!confirm(rep ? `REPLACE all current data with ${d.tx.length} transactions and ${d.exp.length} expenses?` : `MERGE ${d.tx.length} transactions and ${d.exp.length} expenses? Records already present (same ID) are skipped.`))
        return;
    let n = 0;
    if (rep) {
        await clr('tx');
        await clr('exp')
    }
    const have = new Set([...TX, ...EX].map(x => x.id));
    for (const x of d.tx)
        if (rep || !have.has(x.id)) {
            await put('tx', x);
            n++
        }
    for (const x of d.exp)
        if (rep || !have.has(x.id)) {
            await put('exp', x);
            n++
        }
    toast(`✔ Imported ${n} records`);
    go('bak')
}
function bak() {
    return `<h2>បម្រុងទុក Backup & Restore</h2><div class=card><button class=btn onclick=exJSON()>⬇ Export all (JSON)</button><button class="btn x" onclick=exCSV()>⬇ Export transactions (CSV / Excel)</button></div>
<div class=card><b>Import JSON backup</b><br><label>Mode<select id=mode><option value=merge>Merge (skip duplicates)</option><option value=replace>Replace all current data</option></select></label><br><input type=file accept=".json" onchange="imp(this.files[0]);this.value=''">
<p class=note>The file is checked before anything is imported.</p></div><div class=card><b>មគ្គុទ្ទេសក៍ Guide</b><p>១. ចុច Export JSON រៀងរាល់ចុងថ្ងៃ ហើយចម្លងឯកសារទៅ USB ឬ Drive។<br>២. ពេលប្តូរកុំព្យូទ័រ ឬបាត់ទិន្នន័យ ចុច Import ហើយជ្រើសឯកសារ .json។<br><span class=note>1. Export JSON daily and copy it to a USB drive. 2. To restore, Import the file (Merge keeps current data, Replace overwrites it).</span></p></div>`
}
/* ---- settings ---- */
function set() {
    return `<h2>ការកំណត់ Settings</h2><form class=card onsubmit="chPw(event)"><b>ប្តូរពាក្យសម្ងាត់ Change password</b><div class=fg><label>Current<input id=o1 type=password required></label><label>New (min 8)<input id=o2 type=password required></label><label>Confirm<input id=o3 type=password required></label></div><button class=btn>Change</button></form>
<div class=card><button class=btn onclick="go('out')">🔒 Lock / Logout</button><p class=note>Browser-only login protects the screen, not the files. Data is not encrypted; anyone with access to your Windows account could read it. Use a Windows password/BitLocker and keep backups. Forgot password? Resetting deletes all data here, so restore from a JSON backup.</p></div>
<div class=card><b>របៀបប្រើ How to use</b><p>១. ចុចពីរដងលើ index.html (បើកក្នុង Chrome ឬ Edge)។<br>២. ចូលដោយឈ្មោះ និងពាក្យសម្ងាត់។<br>៣. ចុច «បន្ថែមប្រតិបត្តិការ» ដើម្បីកត់ត្រាអតិថិជននីមួយៗ។<br>៤. មើលរបាយការណ៍ប្រចាំថ្ងៃ សប្តាហ៍ ខែ។<br>៥. ចុច «បម្រុងទុក» រៀងរាល់ថ្ងៃ ដើម្បីរក្សាទិន្នន័យ។<br>⚠ ប្រើកុំព្យូទ័រ និង Browser តែមួយ ព្រោះទិន្នន័យរក្សាទុកក្នុង Browser នោះ។</p></div>`
}
async function chPw(e) {
    e.preventDefault();
    const o = await get('meta', 'owner')
      , n = $('o2').value;
    if (await hash($('o1').value, unb(o.salt)) !== o.hash)
        return alert('Current password is wrong');
    if (n.length < 8 || n !== $('o3').value)
        return alert('New password: min 8 characters and must match');
    await mkOwner(o.user, n);
    alert('✔ Password changed');
    showLogin()
}
(async () => {
    if (!window.indexedDB || !window.crypto)
        return $('app').textContent = 'Please use Chrome or Edge';
    await open();
    navigator.storage?.persist?.();
    showLogin()
}
)();
