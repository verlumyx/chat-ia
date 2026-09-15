import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/rag';

export async function POST(request: Request) {
  try {
    const { instanceName, integration = "WHATSAPP-BAILEYS" } = await request.json();
    const apiKey = process.env.AUTHENTICATION_API_KEY;
    const apiUrl = process.env.EVOLUTION_API_URL || "http://localhost:8080";

    if (!apiKey) {
      return NextResponse.json({ error: "Missing AUTHENTICATION_API_KEY" }, { status: 500 });
    }

    const response = await fetch(`${apiUrl}/instance/create`, {
      method: "POST",
      headers: {
        "apikey": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instanceName,
        integration,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    
    // Save to Supabase
    if (data && data.instance) {
      try {
        const supabase = getSupabaseClient();
        const { error: insertError } = await supabase
          .from('evolution_instances')
          .insert({
            instance_name: data.instance.instanceName,
            instance_id: data.instance.instanceId,
            integration: data.instance.integration,
            status: data.instance.status,
            hash: data.hash
          });
          
        if (insertError) {
          console.error("Error saving instance to Supabase:", insertError);
        }
      } catch (dbError) {
        console.error("Error initializing Supabase client:", dbError);
      }
    }
    
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to create instance" }, { status: 500 });
  }
}
