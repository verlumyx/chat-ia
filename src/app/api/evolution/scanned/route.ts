import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/rag';

export async function POST(request: Request) {
  try {
    const { instanceName } = await request.json();

    if (!instanceName) {
      return NextResponse.json({ error: "Missing instanceName" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('evolution_instances')
      .update({ qr_scanned: true, updated_at: new Date().toISOString() })
      .eq('instance_name', instanceName)
      .select();

    if (error) {
      console.error("Error updating qr_scanned in Supabase:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, instance: data?.[0] });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update instance" }, { status: 500 });
  }
}
