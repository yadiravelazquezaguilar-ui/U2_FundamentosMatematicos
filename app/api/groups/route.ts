export async function GET(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return Response.json({groups:[]},{status:500});
 const response=await fetch(`${url}/rest/v1/grupos?activo=eq.true&select=id,nombre&order=nombre.asc`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
 if(!response.ok)return Response.json({groups:[]},{status:response.status});
 return Response.json({groups:await response.json()});
}

