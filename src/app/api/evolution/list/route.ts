import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/rag';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('evolution_instances')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ instance: data?.[0] || null });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch instance" }, { status: 500 });
  }
}
