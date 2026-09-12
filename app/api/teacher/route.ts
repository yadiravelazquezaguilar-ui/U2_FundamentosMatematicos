type Profile={id:string;matricula:string;nombre_completo:string;rol:string;cuenta_activa:boolean;created_at:string};
type Tokens={access_token:string;refresh_token:string;expires_in?:number};

async function cfg(){return{url:process.env.NEXT_PUBLIC_SUPABASE_URL||"",key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||""}}
function ck(r:Request,n:string){return r.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${n}=`))?.slice(n.length+1)||""}
async function call(path:string,access?:string){const{url,key}=await cfg();return fetch(`${url}${path}`,{headers:{apikey:key,Authorization:`Bearer ${access||key}`,"Content-Type":"application/json"}})}
async function access(request:Request){
 const token=ck(request,"fm_access");if(token)return token;
 const refresh=ck(request,"fm_refresh");if(!refresh)return"";const{url,key}=await cfg();const r=await fetch(`${url}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:refresh})});if(!r.ok)return"";return((await r.json())as Tokens).access_token;
}
export async function GET(request:Request){
 const token=await access(request);if(!token)return Response.json({error:"Sesión no válida"},{status:401});
 const me=await call("/auth/v1/user",token);if(!me.ok)return Response.json({error:"Sesión no válida"},{status:401});const uid=((await me.json())as{id:string}).id;
 const profileRequest=await call(`/rest/v1/profiles?id=eq.${uid}&select=id,matricula,nombre_completo,rol,cuenta_activa`,token);const mine=((await profileRequest.json())as Profile[])[0];if(!mine||mine.rol!=="docente"||!mine.cuenta_activa)return Response.json({error:"Acceso exclusivo para docentes"},{status:403});
 const teacherGroups:Record<string,string[]>={DOCENTE001:["1B","1C"],DOCENTE002:["1D","1E"],DOCENTE003:["1A"]};
 const assignedGroups=teacherGroups[mine.matricula.toUpperCase()]||[];
 const groupKey=(value:string)=>{const clean=value.trim().toUpperCase().replace(/\s+/g,"");return /^[A-E]$/.test(clean)?`1${clean}`:clean};
 const [studentsResponse,progressResponse,enrollmentsResponse,groupsResponse]=await Promise.all([
  call("/rest/v1/profiles?rol=eq.alumno&select=id,matricula,nombre_completo,cuenta_activa,created_at&order=nombre_completo.asc",token),
  call("/rest/v1/estado_alumno?select=alumno_id,progreso,updated_at",token),
  call("/rest/v1/alumnos_grupos?select=alumno_id,grupos(nombre)&activo=eq.true",token),
  call("/rest/v1/grupos?activo=eq.true&select=nombre&order=nombre.asc",token)
 ]);
 const students=studentsResponse.ok?await studentsResponse.json() as Profile[]:[];
 const states=progressResponse.ok?await progressResponse.json() as {alumno_id:string;progreso:{u2?:{done?:string[];topic?:number;errorCount?:number;attemptCount?:number;topicErrors?:Record<string,number>;resetAt?:string;history?:unknown[]}};updated_at:string}[]:[];
 const enrollments=enrollmentsResponse.ok?await enrollmentsResponse.json() as {alumno_id:string;grupos:{nombre:string}|null}[]:[];
 const groups=groupsResponse.ok?await groupsResponse.json() as {nombre:string}[]:[];
 const topicNames=["Ecuaciones de primer grado","Desigualdades lineales","Sistemas de ecuaciones lineales","Ecuaciones de segundo grado"];
 const rows=students.map(s=>{const state=states.find(x=>x.alumno_id===s.id),unit=state?.progreso?.u2,done=unit?.done?.length||0,storedAttempts=Number(unit?.attemptCount)||0,storedErrors=Number(unit?.errorCount)||0,byTopic=unit?.topicErrors||{},entries=Object.entries(byTopic).map(([key,value])=>[Number(key),Number(value)] as const).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]),reinforcement=entries.length?topicNames[entries[0][0]]||"Tema sin identificar":"Sin dificultad específica registrada";return{id:s.id,matricula:s.matricula,nombre:s.nombre_completo,activo:s.cuenta_activa,grupo:enrollments.find(x=>x.alumno_id===s.id)?.grupos?.nombre||"Sin grupo",actividades:done,progreso:Math.min(100,Math.round(done/24*100)),intentos:storedAttempts,errores:storedErrors,refuerzo:reinforcement,erroresPorTema:byTopic,historial:unit?.history?.length||0,ultimaActividad:state?.updated_at||s.created_at}}).filter(s=>assignedGroups.includes(groupKey(s.grupo)));
 const visibleGroups=groups.map(x=>x.nombre).filter(nombre=>assignedGroups.includes(groupKey(nombre)));
 return Response.json({teacher:{matricula:mine.matricula,nombre:mine.nombre_completo,groups:visibleGroups},students:rows,groups:visibleGroups,stats:{alumnos:rows.length,activos:rows.filter(x=>x.activo).length,promedio:rows.length?Math.round(rows.reduce((a,x)=>a+x.progreso,0)/rows.length):0,errores:rows.reduce((a,x)=>a+x.errores,0)}});
}
export async function DELETE(request:Request){
 const token=await access(request);if(!token)return Response.json({error:"Sesión no válida"},{status:401});
 const me=await call("/auth/v1/user",token);if(!me.ok)return Response.json({error:"Sesión no válida"},{status:401});const uid=((await me.json())as{id:string}).id;
 const profileRequest=await call(`/rest/v1/profiles?id=eq.${uid}&select=id,matricula,nombre_completo,rol,cuenta_activa`,token);const mine=((await profileRequest.json())as Profile[])[0];if(!mine||mine.rol!=="docente"||!mine.cuenta_activa)return Response.json({error:"Acceso exclusivo para docentes"},{status:403});
 const body=await request.json() as {studentId?:string};if(!body.studentId)return Response.json({error:"Falta seleccionar al estudiante"},{status:400});
 const teacherGroups:Record<string,string[]>={DOCENTE001:["1B","1C"],DOCENTE002:["1D","1E"],DOCENTE003:["1A"]};const assigned=teacherGroups[mine.matricula.toUpperCase()]||[];
 const enrollment=await call(`/rest/v1/alumnos_grupos?alumno_id=eq.${encodeURIComponent(body.studentId)}&activo=eq.true&select=grupos(nombre)`,token);const enrolled=enrollment.ok?await enrollment.json() as {grupos:{nombre:string}|null}[]:[];const rawGroup=(enrolled[0]?.grupos?.nombre||"").trim().toUpperCase().replace(/\s+/g,"");const group=/^[A-E]$/.test(rawGroup)?`1${rawGroup}`:rawGroup;if(!assigned.includes(group))return Response.json({error:"El alumno no pertenece a tus grupos asignados"},{status:403});
 const currentRequest=await call(`/rest/v1/estado_alumno?alumno_id=eq.${encodeURIComponent(body.studentId)}&select=progreso`,token);const currentRows=currentRequest.ok?await currentRequest.json() as {progreso:Record<string,unknown>}[]:[];const root=currentRows[0]?.progreso||{};const current=(root.u2&&typeof root.u2==="object"?root.u2:{}) as Record<string,unknown>;const previousHistory=Array.isArray(current.history)?current.history:[];const now=new Date().toISOString();const archived={archivedAt:now,resetBy:{id:mine.id,matricula:mine.matricula},progress:Object.fromEntries(Object.entries(current).filter(([key])=>key!=="history"))};
 const freshProgress={done:[],topic:0,practiceByTopic:{},errorCount:0,attemptCount:0,topicErrors:{},updatedAt:Date.now(),resetAt:now,history:[...previousHistory,archived]};
 const configuration=await cfg();const adminKey=process.env.SUPABASE_SERVICE_ROLE_KEY||"";const reset=await fetch(`${configuration.url}/rest/v1/estado_alumno?on_conflict=alumno_id`,{method:"POST",headers:{apikey:adminKey||configuration.key,Authorization:`Bearer ${adminKey||token}`,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({alumno_id:body.studentId,progreso:{...root,u2:freshProgress},updated_at:now})});if(!reset.ok)return Response.json({error:"No fue posible archivar y reiniciar el progreso"},{status:500});
 return Response.json({ok:true});
}

export async function PATCH(request:Request){
 const token=await access(request);if(!token)return Response.json({error:"Sesión no válida"},{status:401});
 const me=await call("/auth/v1/user",token);if(!me.ok)return Response.json({error:"Sesión no válida"},{status:401});const uid=((await me.json())as{id:string}).id;
 const profileRequest=await call(`/rest/v1/profiles?id=eq.${uid}&select=id,matricula,nombre_completo,rol,cuenta_activa`,token);const mine=((await profileRequest.json())as Profile[])[0];if(!mine||mine.rol!=="docente"||!mine.cuenta_activa)return Response.json({error:"Acceso exclusivo para docentes"},{status:403});
 const body=await request.json() as {studentId?:string;password?:string};if(!body.studentId||!body.password)return Response.json({error:"Faltan el estudiante o la contraseña temporal"},{status:400});if(body.password.length<8)return Response.json({error:"La contraseña temporal debe tener al menos 8 caracteres"},{status:400});
 const teacherGroups:Record<string,string[]>={DOCENTE001:["1B","1C"],DOCENTE002:["1D","1E"],DOCENTE003:["1A"]};const assigned=teacherGroups[mine.matricula.toUpperCase()]||[];
 const enrollment=await call(`/rest/v1/alumnos_grupos?alumno_id=eq.${encodeURIComponent(body.studentId)}&activo=eq.true&select=grupos(nombre)`,token);const enrolled=enrollment.ok?await enrollment.json() as {grupos:{nombre:string}|null}[]:[];const rawGroup=(enrolled[0]?.grupos?.nombre||"").trim().toUpperCase().replace(/\s+/g,"");const group=/^[A-E]$/.test(rawGroup)?`1${rawGroup}`:rawGroup;if(!assigned.includes(group))return Response.json({error:"El alumno no pertenece a tus grupos asignados"},{status:403});
 const{url}=await cfg();const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY||"";if(!serviceKey)return Response.json({error:"El restablecimiento de contraseñas aún no está habilitado en Netlify"},{status:503});
 const changed=await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(body.studentId)}`,{method:"PUT",headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},body:JSON.stringify({password:body.password})});if(!changed.ok)return Response.json({error:"Supabase no pudo restablecer la contraseña"},{status:500});
 return Response.json({ok:true});
}
