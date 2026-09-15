import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { instanceName } = await request.json();
    const apiKey = process.env.AUTHENTICATION_API_KEY;
    const apiUrl = process.env.EVOLUTION_API_URL || "http://localhost:8080";
    const webhookUrl = process.env.URL_APP_WEBHOOK_EVOLUTION || "http://localhost:3000/api/evolution/webhook";

    if (!apiKey) {
      return NextResponse.json({ error: "Missing AUTHENTICATION_API_KEY" }, { status: 500 });
    }

    if (!instanceName) {
      return NextResponse.json({ error: "Missing instanceName" }, { status: 400 });
    }

    const payload = {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: [
          "MESSAGES_UPSERT",
          "SEND_MESSAGE"
        ]
      }
    };

    const response = await fetch(`${apiUrl}/webhook/set/${instanceName}`, {
      method: "POST",
      headers: {
        "apikey": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to set webhook" }, { status: 500 });
  }
}
