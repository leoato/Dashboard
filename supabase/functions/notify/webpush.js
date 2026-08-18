/* Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) — 의존성 없이 WebCrypto만 사용.
   Deno(Supabase Edge)와 Node 18+ 양쪽에서 동일하게 동작한다. */
const TE = new TextEncoder();

export function b64uDec(s){
  s = String(s).replace(/-/g,'+').replace(/_/g,'/');
  while (s.length % 4) s += '=';
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function b64uEnc(buf){
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
export async function encrypt(payload, p256dhB64, authB64){
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
export async function vapidHeader(endpoint, pubB64, privB64, subject){
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
export async function sendPush(sub, dataObj, vapid){
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
