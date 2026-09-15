import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const instanceName = searchParams.get('instanceName');
    
    if (!instanceName) {
      return NextResponse.json({ error: "Missing instanceName parameter" }, { status: 400 });
    }

    const apiKey = process.env.AUTHENTICATION_API_KEY;
    const apiUrl = process.env.EVOLUTION_API_URL || "http://localhost:8080";

    if (!apiKey) {
      return NextResponse.json({ error: "Missing AUTHENTICATION_API_KEY" }, { status: 500 });
    }

    const response = await fetch(`${apiUrl}/instance/connect/${instanceName}`, {
      method: "GET",
      headers: {
        "apikey": apiKey,
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to connect instance" }, { status: 500 });
  }
}
