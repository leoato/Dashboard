/* Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) — 의존성 없이 WebCrypto만 사용.
   Deno(Supabase Edge)와 Node 18+ 양쪽에서 동일하게 동작한다. */
const TE = new TextEncoder();

function b64uDec(s){
  s = String(s).replace(/-/g,'+').replace(/_/g,'/');
  while (s.length % 4) s += '=';
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64uEnc(buf){
  const u8 = new Uint8Array(buf); let s='';
  for (let i=0;i<u8.length;i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function cat(...arrs){
  let n=0; for (const a of arrs) n+=a.length;
  const o=new Uint8Array(n); let p=0;
  for (const a of arrs){ o.set(a,p); p+=a.length; }
  return o;
}

async function hkdf(ikm, salt, info, len){
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info}, k, len*8));
}

/* 구독자 공개키(p256dh)+auth로 payload를 봉인해 단일 aes128gcm 레코드를 만든다 */
async function encrypt(payload, p256dhB64, authB64){
  const uaPub = b64uDec(p256dhB64), authSecret = b64uDec(authB64);
  const plaintext = cat(TE.encode(payload), new Uint8Array([2]));   // 0x02 = 마지막 레코드 구분자

  const as = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'}, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));   // 0x04||X||Y (65)
  const uaKey = await crypto.subtle.importKey('raw', uaPub, {name:'ECDH',namedCurve:'P-256'}, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaKey}, as.privateKey, 256));

  const keyInfo = cat(TE.encode('WebPush: info'), new Uint8Array([0]), uaPub, asPub);
  const ikm   = await hkdf(shared, authSecret, keyInfo, 32);
  const salt  = crypto.getRandomValues(new Uint8Array(16));
  const cek   = await hkdf(ikm, salt, cat(TE.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(ikm, salt, cat(TE.encode('Content-Encoding: nonce'),     new Uint8Array([0])), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce}, aesKey, plaintext));

  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);   // 헤더 + 암호문
}

/* VAPID: 엔드포인트 출처를 aud로 갖는 ES256 JWT */
async function vapidHeader(endpoint, pubB64, privB64, subject){
  const aud = new URL(endpoint).origin;
  const pub = b64uDec(pubB64);
  const jwk = {
    kty:'EC', crv:'P-256', ext:true,
    x: b64uEnc(pub.slice(1,33)), y: b64uEnc(pub.slice(33,65)), d: privB64
  };
  const key = await crypto.subtle.importKey('jwk', jwk, {name:'ECDSA',namedCurve:'P-256'}, false, ['sign']);
  const head = b64uEnc(TE.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
  const body = b64uEnc(TE.encode(JSON.stringify({
    aud, exp: Math.floor(Date.now()/1000) + 12*3600, sub: subject || 'mailto:farohance@gmail.com'
  })));
  const sig = await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'}, key, TE.encode(head+'.'+body));
  return 'vapid t=' + head+'.'+body+'.'+b64uEnc(sig) + ', k=' + pubB64;
}

/* 한 구독에 알림 1건 발송. {ok, status} 반환 — 404/410이면 죽은 구독. */
async function sendPush(sub, dataObj, vapid){
  const body = await encrypt(JSON.stringify(dataObj), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method:'POST',
    headers:{
      'Authorization': await vapidHeader(sub.endpoint, vapid.pub, vapid.priv, vapid.subject),
      'Content-Encoding':'aes128gcm',
      'Content-Type':'application/octet-stream',
      'TTL':'86400'
    },
    body
  });
  return { ok: res.ok, status: res.status, gone: res.status===404||res.status===410 };
}

/* ═══════════════════ 오늘선생·오늘학생 알림 발송 ═══════════════════ */
const SUPA = Deno.env.get('SUPABASE_URL');
const SRV  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const VAPID = {
  pub: Deno.env.get('VAPID_PUBLIC'),
  priv: Deno.env.get('VAPID_PRIVATE'),
  subject: Deno.env.get('VAPID_SUBJECT') || 'mailto:farohance@gmail.com'
};
const CORS = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Content-Type':'application/json'
};
const H = { apikey: SRV, Authorization: 'Bearer ' + SRV, 'Content-Type':'application/json' };
const rest = async (path, init) => {
  const r = await fetch(SUPA + '/rest/v1/' + path, { ...(init||{}), headers: { ...H, ...((init||{}).headers||{}) } });
  const t = await r.text();
  return t ? JSON.parse(t) : null;
};

/* 알림 문구는 서버에서 만든다 — 앱은 무슨 일이 있었는지만 알려준다 */
const MSG = {
  submitted: o => ({ to:'teacher', title:'제출 도착', body:[o.who||'학생', o.sheet, o.score].filter(Boolean).join(' · ') }),
  question:  o => ({ to:'teacher', title:'질문이 왔어요', body:[o.who||'학생', o.sheet, o.q].filter(Boolean).join(' · ').slice(0,120) }),
  sheet:     o => ({ to:'student', title:'새 문제지', body:(o.sheet||'문제지') + ' 도착했어요' }),
  answered:  o => ({ to:'student', title:'쌤 답변', body:'질문에 답변이 달렸어요' }),
  test:      o => ({ to:o.role==='teacher'?'teacher':'student', title:'알림 테스트', body:'이렇게 뜨면 성공이에요' })
};

async function fanout(pair, role, data){
  const subs = await rest(`push_subs?pair_code=eq.${encodeURIComponent(pair)}&role=eq.${role}&select=*`) || [];
  const payload = {
    ...data,
    icon: role==='teacher' ? './icon-teacher.png' : './icon-student.png',
    url:  role==='teacher' ? './index.html'       : './student.html'
  };
  let sent=0, dead=0;
  for (const s of subs){
    try{
      const r = await sendPush(s, payload, VAPID);
      if (r.ok){ sent++; await rest(`push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {method:'PATCH', body: JSON.stringify({last_ok:new Date().toISOString()})}); }
      else if (r.gone){ dead++; await rest(`push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {method:'DELETE'}); }
    }catch(e){ /* 한 기기 실패가 나머지를 막지 않는다 */ }
  }
  return { sent, dead, total: subs.length };
}

/* 미모 리마인더 — 매시 깨어나서 '지금 보낼 때인가'만 판단한다 */
async function miniReminder(){
  const kst = new Date(Date.now() + 9*3600*1000);          // UTC → KST
  const dow = kst.getUTCDay(), hour = kst.getUTCHours();
  const today = kst.toISOString().slice(0,10);
  if (dow===0 || dow===6) return { skipped:'주말' };        // 금~월은 교재 숙제 기간

  const subs = await rest('push_subs?role=eq.student&select=pair_code') || [];
  const pairs = [...new Set(subs.map(s => s.pair_code))];
  const out = [];
  for (const pair of pairs){
    const st = await rest(`app_state?pair_code=eq.${encodeURIComponent(pair+':push')}&select=data`) || [];
    const cfg = (st[0] && st[0].data) || {};
    if (cfg.mini === false) { out.push({pair, skipped:'꺼짐'}); continue; }
    if (hour !== (cfg.hour ?? 17)) { out.push({pair, skipped:'시각 아님'}); continue; }
    if (cfg.last_mini === today)  { out.push({pair, skipped:'오늘 발송함'}); continue; }

    const mini = await rest(`worksheets?pair_code=eq.${encodeURIComponent(pair)}&kind=eq.mini&serve_date=eq.${today}&status=eq.assigned&select=id,answer_key`) || [];
    if (!mini.length) { out.push({pair, skipped:'오늘 미모 없음/제출됨'}); continue; }

    const n = (mini[0].answer_key || []).length || 10;
    const r = await fanout(pair, 'student', { title:'오늘의 미모', body:`${n}문제 풀 시간이에요`, tag:'mini' });
    await rest('app_state', { method:'POST', headers:{ Prefer:'resolution=merge-duplicates' },
      body: JSON.stringify({ pair_code: pair+':push', data: { ...cfg, last_mini: today }, updated_at: new Date().toISOString() }) });
    out.push({ pair, ...r });
  }
  return { hour, today, results: out };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try{
    if (!VAPID.pub || !VAPID.priv) return new Response(JSON.stringify({error:'VAPID 키 미설정'}), {status:500, headers:CORS});
    const o = await req.json().catch(() => ({}));

    if (o.kind === 'mini_reminder') return new Response(JSON.stringify(await miniReminder()), { headers: CORS });

    const make = MSG[o.kind];
    if (!make) return new Response(JSON.stringify({error:'알 수 없는 kind'}), {status:400, headers:CORS});
    if (!o.pair) return new Response(JSON.stringify({error:'pair 없음'}), {status:400, headers:CORS});

    const m = make(o);
    const r = await fanout(o.pair, m.to, { title:m.title, body:m.body, tag:o.kind });
    return new Response(JSON.stringify(r), { headers: CORS });
  }catch(e){
    return new Response(JSON.stringify({error:String(e)}), { status:500, headers:CORS });
  }
});
