const PRODUCTS={"980":{"name":"Crystal Candy (Vegan)","price":2300,"flavor":false},"981":{"name":"Chocolate Chips Crunchy Cookies","price":2671,"flavor":false},"982":{"name":"Cornflake Crunchy Cookies","price":1900,"flavor":false},"983":{"name":"Saya Nak Cicah Dalam Susu","price":2672,"flavor":false},"984":{"name":"Saya Nak S’mores","price":3300,"flavor":false},"985":{"name":"Saya Tak Suka S’mores","price":3100,"flavor":false},"986":{"name":"Dark Chocolate Crunchy Cookies","price":3100,"flavor":false},"987":{"name":"Saya Tak Suka Manis","price":3000,"flavor":false},"988":{"name":"Saya Nak Banyak S’mores","price":6700,"flavor":false},"989":{"name":"Saya Nak S’mores Tapi Tak Nak Matcha","price":3265,"flavor":false},"990":{"name":"Saya Nak Sepuluh La","price":8300,"flavor":false},"991":{"name":"Tapak Muka","price":4000,"flavor":false},"992":{"name":"Matcha Crunchy Cookies","price":3100,"flavor":false},"993":{"name":"Saya Nak Semua La","price":15300,"flavor":false},"994":{"name":"Red Velvet Crunchy Cookies","price":3000,"flavor":false},"996":{"name":"Saya Suka Biscoff","price":3800,"flavor":false},"1001":{"name":"Chocolate Chip","price":700,"flavor":true},"1002":{"name":"Choc Chip S’mores","price":800,"flavor":true},"1003":{"name":"Choc Chip Biscoff","price":950,"flavor":true},"1004":{"name":"Red Velvet","price":750,"flavor":true},"1005":{"name":"Red Velvet S’mores","price":800,"flavor":true},"1006":{"name":"Double White Choc","price":880,"flavor":true},"1007":{"name":"D’ White Choc Smores","price":930,"flavor":true},"1008":{"name":"Triple Chocolate","price":850,"flavor":true},"1009":{"name":"Triple Choc S’mores","price":900,"flavor":true},"1010":{"name":"Matcha","price":850,"flavor":true},"1011":{"name":"Matcha S’mores","price":950,"flavor":true},"1012":{"name":"Matcha Biscoff","price":1000,"flavor":true},"1013":{"name":"Matcha Kinder","price":1050,"flavor":true},"1014":{"name":"Cloud 9","price":950,"flavor":true},"1015":{"name":"Seasalt Walnut","price":1090,"flavor":true},"1016":{"name":"White Choc Macadamia","price":1300,"flavor":true},"1017":{"name":"Matcha Kinder Kunafa","price":1400,"flavor":true}};
const API='https://gate.chip-in.asia/api/v1/';
const out=(o,s=200)=>Response.json(o,{status:s,headers:{'Cache-Control':'no-store'}});
async function chip(env,path,body){const r=await fetch(API+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+env.CHIP_API_KEY,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('CHIP request failed');return r.json()}
function enabled(e){return e.CHIP_API_KEY&&e.CHIP_BRAND_ID&&e.DB&&e.STORE_ORIGIN&&e.PAYMENT_ENABLED==='true'&&e.SHIPPING_RATES}
function delivery(e,region){const rates=JSON.parse(e.SHIPPING_RATES);const v=rates[region];if(!Number.isInteger(v)||v<0)throw Error('Delivery unavailable');return v}
export default {async fetch(req,env){const u=new URL(req.url);if(!u.pathname.startsWith('/api/'))return env.ASSETS?env.ASSETS.fetch(req):out({error:'Not found'},404);
try{
if(u.pathname==='/api/payment-config'&&req.method==='GET')return out({enabled:!!enabled(env),regions:enabled(env)?JSON.parse(env.SHIPPING_RATES):{}});
if(!enabled(env))return out({error:'Online payment unavailable'},503);
if(u.pathname==='/api/checkout'&&req.method==='POST'){
if(req.headers.get('Origin')!==env.STORE_ORIGIN)return out({error:'Invalid origin'},403);
const b=await req.json();if(!Array.isArray(b.items)||b.items.length<1||b.items.length>50)return out({error:'Invalid basket'},400);
let subtotal=0,soft=0;const used=new Set(),items=[];for(const l of b.items){const p=PRODUCTS[l.id];if(!p||used.has(l.id)||!Number.isInteger(l.qty)||l.qty<1||l.qty>99)return out({error:'Invalid item'},400);used.add(l.id);subtotal+=p.price*l.qty;if(p.flavor)soft+=l.qty;items.push({name:p.name,price:p.price,quantity:l.qty})}
if(soft%4!==0)return out({error:'Complete your cookie box'},400);
const c=b.customer||{};for(const k of ['name','email','phone','address','postcode','region'])if(typeof c[k]!=='string'||!c[k].trim()||c[k].length>300)return out({error:'Missing customer details'},400);
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))return out({error:'Invalid email'},400);
const shipping=delivery(env,c.region),total=subtotal+shipping,id=crypto.randomUUID(),commission=Math.round(subtotal*15/100);if(shipping)items.push({name:'Delivery',price:shipping,quantity:1});
await env.DB.prepare('INSERT INTO orders (id,subtotal,shipping,total,commission,status,details) VALUES (?,?,?,?,?,?,?)').bind(id,subtotal,shipping,total,commission,'creating',JSON.stringify({items:b.items,customer:c,gift:String(b.gift||'').slice(0,300)})).run();
const purchase=await chip(env,'purchases/',{brand_id:env.CHIP_BRAND_ID,client:{email:c.email,full_name:c.name},purchase:{currency:'MYR',products:items},reference:id,success_redirect:env.STORE_ORIGIN+'/?order='+id,failure_redirect:env.STORE_ORIGIN+'/?payment=cancelled',success_callback:u.origin+'/api/chip-callback'});
if(!purchase.id||!purchase.checkout_url||new URL(purchase.checkout_url).protocol!=='https:')throw Error('Invalid purchase response');
await env.DB.prepare("UPDATE orders SET chip_id=?,status='pending' WHERE id=?").bind(purchase.id,id).run();return out({checkout_url:purchase.checkout_url});
}
if(u.pathname==='/api/chip-callback'&&req.method==='POST'){
const body=await req.json();if(typeof body.id!=='string'||!/^[a-f0-9-]{36}$/i.test(body.id))return out({error:'Invalid event'},400);
const order=await env.DB.prepare('SELECT * FROM orders WHERE chip_id=?').bind(body.id).first();if(!order)return out({error:'Unknown purchase'},404);
// Callback is only a notification; authoritative status is fetched with the server API key.
const p=await chip(env,'purchases/'+encodeURIComponent(body.id)+'/');
if(p.id!==order.chip_id||p.reference!==order.id||p.purchase?.currency!=='MYR'||Number(p.purchase?.total)!==order.total)return out({error:'Purchase mismatch'},409);
if(p.status==='paid')await env.DB.prepare("UPDATE orders SET status='paid',paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP) WHERE id=? AND status='pending'").bind(order.id).run();
return out({ok:true});
}
if(u.pathname==='/api/order'&&req.method==='GET'){const id=u.searchParams.get('id');const row=await env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(id).first();return row?out(row):out({error:'Not found'},404)}
return out({error:'Not found'},404)
}catch(e){return out({error:'Unable to process request'},400)}}};
