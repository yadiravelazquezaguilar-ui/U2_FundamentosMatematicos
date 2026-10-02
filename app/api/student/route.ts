type Tokens={access_token:string;refresh_token:string;expires_in?:number};
type Profile={id:string;matricula:string;nombre_completo:string;rol:"alumno"|"docente";cuenta_activa:boolean};

async function config(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const teacherEmail=process.env.TEACHER_LOGIN_EMAIL;
 if(!url||!key)throw new Error("Supabase no está configurado");
 return {url,key,teacherEmail};
}
function readCookie(request:Request,name:string){return request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1)??""}
function sessionHeaders(tokens?:Tokens,clear=false){
 const headers=new Headers({"Content-Type":"application/json"});
 if(clear){headers.append("Set-Cookie","fm_access=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");headers.append("Set-Cookie","fm_refresh=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0")}
 else if(tokens){headers.append("Set-Cookie",`fm_access=${tokens.access_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${tokens.expires_in||3600}`);headers.append("Set-Cookie",`fm_refresh=${tokens.refresh_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60*60*24*30}`)}
 return headers;
}
async function authRequest(path:string,init:RequestInit={}){const {url,key}=await config();return fetch(`${url}${path}`,{...init,headers:{apikey:key,"Content-Type":"application/json",...(init.headers||{})}})}
async function refresh(request:Request){const token=readCookie(request,"fm_refresh");if(!token)return null;const r=await authRequest("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:JSON.stringify({refresh_token:token})});return r.ok?await r.json() as Tokens:null}
async function session(request:Request){
 let accessToken=readCookie(request,"fm_access"),tokens:Tokens|undefined;
 if(!accessToken){tokens=await refresh(request)||undefined;accessToken=tokens?.access_token||""}
 if(!accessToken)return null;
 let response=await authRequest("/auth/v1/user",{headers:{Authorization:`Bearer ${accessToken}`}});
 if(!response.ok){tokens=await refresh(request)||undefined;accessToken=tokens?.access_token||"";if(!accessToken)return null;response=await authRequest("/auth/v1/user",{headers:{Authorization:`Bearer ${accessToken}`}})}
 if(!response.ok)return null;
 const authUser=await response.json() as {id:string};
 const p=await authRequest(`/rest/v1/profiles?id=eq.${authUser.id}&select=id,matricula,nombre_completo,rol,cuenta_activa`,{headers:{Authorization:`Bearer ${accessToken}`,Accept:"application/vnd.pgrst.object+json"}});
 if(!p.ok)return null;const profile=await p.json() as Profile;if(!profile.cuenta_activa)return null;return {accessToken,profile,tokens};
}
export async function GET(request:Request){
 const current=await session(request);if(!current)return Response.json({user:null},{status:401,headers:sessionHeaders(undefined,true)});
 const r=await authRequest(`/rest/v1/estado_alumno?alumno_id=eq.${current.profile.id}&select=progreso`,{headers:{Authorization:`Bearer ${current.accessToken}`,Accept:"application/vnd.pgrst.object+json"}});
 const stored=r.ok?(await r.json() as {progreso?:Record<string,unknown>}).progreso||{}:{};
 const progress=(stored.u2&&typeof stored.u2==="object"?stored.u2:{}) as Record<string,unknown>;
 return Response.json({user:{matricula:current.profile.matricula,name:current.profile.nombre_completo,role:current.profile.rol},progress},{headers:sessionHeaders(current.tokens)});
}
export async function POST(request:Request){
 const body=await request.json() as {action?:string;matricula?:string;name?:string;password?:string;groupId?:string};
 if(body.action==="logout")return Response.json({ok:true},{headers:sessionHeaders(undefined,true)});
 const matricula=(body.matricula||"").trim().toUpperCase(),password=body.password||"";
 if(!/^[A-Z0-9_-]{3,30}$/.test(matricula)||password.length<6)return Response.json({error:"Usa una matrícula válida y una contraseña de al menos 6 caracteres."},{status:400});
 const {teacherEmail}=await config();
 const teacherEmails:Record<string,string>={DOCENTE001:teacherEmail||"",DOCENTE002:"mhernandez@laselva.edu.mx",DOCENTE003:"yadira_aguilar@laselva.edu.mx"};
 const email=teacherEmails[matricula]||`${matricula.toLowerCase()}@alumnos.local`;let response:Response;
 if(body.action==="register"&&matricula.startsWith("DOCENTE"))return Response.json({error:"Las cuentas docentes deben ser habilitadas por la administración."},{status:403});
 if(body.action==="register"){const name=(body.name||"").trim();if(name.length<3)return Response.json({error:"Escribe el nombre completo del alumno."},{status:400});if(!body.groupId)return Response.json({error:"Selecciona tu grupo."},{status:400});const group=await authRequest(`/rest/v1/grupos?id=eq.${encodeURIComponent(body.groupId)}&activo=eq.true&select=id`);const validGroup=group.ok?await group.json() as {id:string}[]:[];if(!validGroup.length)return Response.json({error:"El grupo seleccionado no está disponible."},{status:400});response=await authRequest("/auth/v1/signup",{method:"POST",body:JSON.stringify({email,password,data:{matricula,nombre_completo:name}})})}
 else response=await authRequest("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email,password})});
 const data=await response.json() as Tokens&{msg?:string;message?:string;user?:{id:string}};
 if(!response.ok){const duplicate=(data.msg||data.message||"").toLowerCase().includes("already");return Response.json({error:duplicate?"Esta matrícula ya está registrada.":body.action==="register"?"No fue posible crear la cuenta.":"Matrícula o contraseña incorrecta."},{status:response.status})}
 if(!data.access_token)return Response.json({error:"La cuenta fue creada, pero falta desactivar la confirmación de correo en Supabase."},{status:409});
 const p=await authRequest(`/rest/v1/profiles?id=eq.${data.user?.id}&select=id,matricula,nombre_completo,rol,cuenta_activa`,{headers:{Authorization:`Bearer ${data.access_token}`,Accept:"application/vnd.pgrst.object+json"}});
 if(!p.ok)return Response.json({error:"La cuenta existe, pero no fue posible cargar su perfil."},{status:500});
 const profile=await p.json() as Profile;
 if(body.action==="register"&&body.groupId){const enrollment=await authRequest("/rest/v1/alumnos_grupos",{method:"POST",headers:{Authorization:`Bearer ${data.access_token}`,Prefer:"return=minimal"},body:JSON.stringify({alumno_id:profile.id,grupo_id:body.groupId,activo:true})});if(!enrollment.ok)return Response.json({error:"La cuenta fue creada, pero no se pudo asignar el grupo. Comunícate con tu docente."},{status:500})}
 return Response.json({user:{matricula:profile.matricula,name:profile.nombre_completo,role:profile.rol}},{headers:sessionHeaders(data)});
}
export async function PUT(request:Request){
 const current=await session(request);if(!current)return Response.json({error:"Sesión no válida"},{status:401,headers:sessionHeaders(undefined,true)});
 const body=await request.json() as {progress?:Record<string,unknown>};const incoming=body.progress||{};
 const savedRequest=await authRequest(`/rest/v1/estado_alumno?alumno_id=eq.${current.profile.id}&select=progreso`,{headers:{Authorization:`Bearer ${current.accessToken}`,Accept:"application/vnd.pgrst.object+json"}});const savedRoot=savedRequest.ok?(await savedRequest.json() as {progreso?:Record<string,unknown>}).progreso||{}:{};const saved=(savedRoot.u2&&typeof savedRoot.u2==="object"?savedRoot.u2:{}) as Record<string,unknown>;
 const savedReset=typeof saved.resetAt==="string"?saved.resetAt:"",incomingReset=typeof incoming.resetAt==="string"?incoming.resetAt:"";
 if(savedReset&&savedReset!==incomingReset)return Response.json({error:"El docente reinició este intento.",reset:true,progress:saved},{status:409,headers:sessionHeaders(current.tokens)});
 const savedDone=Array.isArray(saved.done)?saved.done.filter((item):item is string=>typeof item==="string"):[];
 const incomingDone=Array.isArray(incoming.done)?incoming.done.filter((item):item is string=>typeof item==="string"):[];
 const savedTopicErrors=saved.topicErrors&&typeof saved.topicErrors==="object"?saved.topicErrors as Record<string,unknown>:{};
 const incomingTopicErrors=incoming.topicErrors&&typeof incoming.topicErrors==="object"?incoming.topicErrors as Record<string,unknown>:{};
 const topicErrors=Object.fromEntries([...new Set([...Object.keys(savedTopicErrors),...Object.keys(incomingTopicErrors)])].map(key=>[key,Math.max(Number(savedTopicErrors[key])||0,Number(incomingTopicErrors[key])||0)]));
 // El avance de un mismo intento es acumulativo. Así, una solicitud antigua que
 // llegue tarde nunca puede borrar una actividad que ya fue completada.
 const progress={
  ...saved,
  ...incoming,
  done:[...new Set([...savedDone,...incomingDone])],
  errorCount:Math.max(Number(saved.errorCount)||0,Number(incoming.errorCount)||0),
  attemptCount:Math.max(Number(saved.attemptCount)||0,Number(incoming.attemptCount)||0),
  topicErrors,
  resetAt:savedReset||incomingReset||undefined,
  history:Array.isArray(saved.history)?saved.history:Array.isArray(incoming.history)?incoming.history:[]
 };
 const r=await authRequest("/rest/v1/estado_alumno?on_conflict=alumno_id",{method:"POST",headers:{Authorization:`Bearer ${current.accessToken}`,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({alumno_id:current.profile.id,progreso:{...savedRoot,u2:progress},updated_at:new Date().toISOString()})});
 if(!r.ok)return Response.json({error:"No fue posible guardar el progreso."},{status:500});return Response.json({ok:true},{headers:sessionHeaders(current.tokens)});
}
