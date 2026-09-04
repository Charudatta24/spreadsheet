import { NextRequest, NextResponse } from "next/server";

interface ParseRequestBody {
  text: string;
  clientDate?: string; // YYYY-MM-DD
  clientTimezone?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: ParseRequestBody = await req.json();
    const rawText = (body?.text || "").trim();

    if (!rawText) {
      return NextResponse.json(
        { success: false, error: "Please write a transaction note." },
        { status: 400 }
      );
    }

    const todayDate = body.clientDate || new Date().toISOString().split("T")[0];
    let apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    // Dynamically read from .env.local in case server started before key was added
    if (!apiKey) {
      try {
        const fs = await import("fs");
        const path = await import("path");
        const envPath = path.join(process.cwd(), ".env.local");
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, "utf8");
          const m = content.match(/^GEMINI_API_KEY=(.+)$/m);
          if (m) apiKey = m[1].trim();
        }
      } catch (_) {}
    }

    if (!apiKey) {
      // Intelligent local fallback if API key is not yet set in .env.local
      const localParsed = parseTransactionLocally(rawText, todayDate);
      return NextResponse.json(localParsed);
    }

    const systemPrompt = `You are an expert financial transaction parser for a phone-style personal accounting notebook.
The user writes quick notes about money transactions. The input can contain ONE or MULTIPLE transactions (often written line by line or naturally in a note).
Language may be natural English, Indian-English, Hinglish, or shorthand.

Current Reference Date: ${todayDate} (Year-Month-Day).

CRITICAL RULES:
1. ACCURACY IS PARAMOUNT. NEVER INVENT ANY FINANCIAL INFORMATION.
2. DO NOT invent an amount, a person, a transaction, or a date.
3. If the user only provided a person without any amount and no other transactions (e.g. "Babulal"), DO NOT invent ₹5,000 or any amount.
   Set "needsClarification": true, "clarificationField": "amount", "clarificationQuestion": "What amount should be recorded for " + person + "?"
4. If the user only provided an amount without a person (e.g. "5000" or "5k"), DO NOT invent a person.
   Set "needsClarification": true, "clarificationField": "person", "clarificationQuestion": "Who is this transaction with?"
5. If direction is completely ambiguous and impossible to infer, ask: "Did you send ₹" + amount + " or receive ₹" + amount + "?"
   Set "needsClarification": true, "clarificationField": "type".
   NOTE: For standard shorthand like "Babulal 5000", default to "sent" (I paid/lent Babulal).
6. Multi-Line & Multiple Transactions Support:
   - If the note has multiple lines or mentions multiple transactions (e.g. "Babulal 5000\nRahul gave 2000\n500 for tea"), extract ALL of them into the "transactions" array.
   - For general petty expense notes like "500 tea" or "200 petrol", set person to "Tea / Food" or "Petrol" or "General Expense", and description to "Tea" / "Petrol", type: "sent".
7. Amount Normalization:
   - "5000", "5,000", "Rs 5000", "INR 5000", "₹5000" -> 5000
   - "5k" -> 5000
   - "2.5k" -> 2500
   - "five thousand" -> 5000
   - "two thousand five hundred" -> 2500
8. Transaction Types:
   - Sent ("sent"): sent, gave, paid, transferred, I gave, I paid, lent, given to.
   - Received ("received"): received, got, gave me, paid me, received from, returned by.
9. Spelling Correction:
   - Fix obvious accidental typos for common names (e.g. "babullal" -> "Babulal", "amitt" -> "Amit").
   - Capitalize the person's name in Title Case.
10. Dates:
   - "today" -> ${todayDate}
   - "yesterday" -> yesterday relative to ${todayDate}
   - "day before yesterday" -> 2 days before ${todayDate}
   - "last Monday", "2 days ago", "1 September" -> compute relative to ${todayDate}
   - If no specific date is mentioned in a line, use ${todayDate}.
   - Output format must strictly be "YYYY-MM-DD".
11. Description / Purpose:
    - Extract if mentioned (e.g. "for food" -> "Food", "for rent" -> "Rent", "dinner" -> "Dinner").
    - If no purpose is mentioned, return null.

Output MUST be strictly valid JSON matching this exact schema:
{
  "success": true,
  "needsClarification": boolean,
  "clarificationQuestion": string | null,
  "clarificationField": "person" | "amount" | "type" | "date" | null,
  "transactions": [
    {
      "person": string,
      "amount": number,
      "currency": "INR",
      "type": "sent" | "received",
      "description": string | null,
      "date": "YYYY-MM-DD",
      "originalText": string
    }
  ],
  "data": {
    "person": string,
    "amount": number,
    "currency": "INR",
    "type": "sent" | "received",
    "description": string | null,
    "date": "YYYY-MM-DD",
    "originalText": string
  } | null
}`;

    // Invoke Gemini via official REST API
    let parsed: any = null;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(4000),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\nUser Note Text:\n" + rawText }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (response.ok) {
        const resData = await response.json();
        const rawJson = resData.candidates?.[0]?.content?.parts?.[0]?.text;
        parsed = JSON.parse(rawJson);
      }
    } catch (e) {
      console.warn("Primary gemini-flash-latest failed, trying fallback:", e);
    }

    if (!parsed) {
      // Fallback to gemini-3.6-flash
      try {
        const fallbackResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(4000),
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\nUser Note Text:\n" + rawText }] }],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json",
              },
            }),
          }
        );

        if (fallbackResponse.ok) {
          const resData = await fallbackResponse.json();
          const rawJson = resData.candidates?.[0]?.content?.parts?.[0]?.text;
          parsed = JSON.parse(rawJson);
        }
      } catch (e2) {
        console.error("Gemini 3.6-flash fallback failed:", e2);
      }
    }

    if (!parsed) {
      // Fallback to intelligent local multi-line parser
      parsed = parseTransactionLocally(rawText, todayDate);
    }

    // Ensure transactions array is consistent
    if (!parsed.transactions && parsed.data) {
      parsed.transactions = [parsed.data];
    } else if (parsed.transactions && parsed.transactions.length > 0 && !parsed.data) {
      parsed.data = parsed.transactions[0];
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("Failed to parse transaction note:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Unable to understand this note. Please try again or check your input.",
      },
      { status: 500 }
    );
  }
}

/**
 * Intelligent local regex fallback parser supporting multi-line phone notes.
 */
function parseTransactionLocally(text: string, todayDate: string) {
  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  const transactions: any[] = [];

  for (const line of lines) {
    const single = parseSingleLine(line, todayDate);
    if (single) {
      transactions.push(single);
    }
  }

  if (transactions.length === 0) {
    // Check if it was a single person name missing amount
    const clean = text.trim();
    if (!clean.match(/\d/)) {
      return {
        success: true,
        needsClarification: true,
        clarificationField: "amount",
        clarificationQuestion: `What amount should be recorded for ${clean}?`,
        transactions: [],
        data: null,
      };
    }
    return {
      success: false,
      error: "Unable to identify transactions in this note. Write something like 'Babulal 5000'.",
    };
  }

  return {
    success: true,
    needsClarification: false,
    transactions,
    data: transactions[0],
  };
}

function parseSingleLine(line: string, todayDate: string) {
  const clean = line.trim();
  if (!clean) return null;

  // Extract amount
  let amount: number | null = null;
  const kMatch = clean.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    amount = Math.round(parseFloat(kMatch[1]) * 1000);
  } else {
    // Try currency-prefixed first (rs. 5000, ₹5000, INR 5000)
    const currencyMatch = clean.match(/(?:rs\.?|inr|₹)\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
    if (currencyMatch) {
      amount = parseFloat(currencyMatch[1].replace(/,/g, ""));
    } else {
      // Strip ordinal suffixes (24th, 1st, 2nd, 3rd) before matching plain numbers
      const stripped = clean.replace(/\b\d+(?:st|nd|rd|th)\b/gi, "");
      const numMatch = stripped.match(/\b(\d+(?:,\d+)*(?:\.\d+)?)\b/);
      if (numMatch) {
        amount = parseFloat(numMatch[1].replace(/,/g, ""));
      }
    }
  }

  if (!amount) return null;

  // Type: sent vs received
  let type: "sent" | "received" = "sent";
  if (/(received|got|gave me|paid me|received from|returned by)/i.test(clean)) {
    type = "received";
  }

  // Description / Purpose
  let description: string | null = null;
  const forMatch = clean.match(/\bfor\s+([a-zA-Z0-9\s]+?)(?:\s+(?:today|yesterday|on\s+\d+))?$/i);
  if (forMatch) {
    description = forMatch[1].trim();
    description = description.charAt(0).toUpperCase() + description.slice(1);
  }

  // Date
  let date = todayDate;
  if (/yesterday/i.test(clean)) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - 1);
    date = d.toISOString().split("T")[0];
  } else if (/day before yesterday/i.test(clean)) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - 2);
    date = d.toISOString().split("T")[0];
  }

  // Clean person name — remove numbers (with full digit matching), keywords, ordinals
  let remaining = clean
    .replace(/(?:(?:rs\.?|inr|₹)\s*)?(\d+(?:\.\d+)?)\s*k\b/gi, "")
    .replace(/\b\d+(?:st|nd|rd|th)\b/gi, "")
    .replace(/(?:(?:rs\.?|inr|₹)\s*)?\b\d+(?:,\d+)*(?:\.\d+)?\b/gi, "")
    .replace(/\b(i gave|i paid|gave me|paid me|received from|received|sent|paid|gave|transferred|got|for [a-zA-Z0-9\s]+|today|yesterday|day before yesterday|rs|inr|to|from|on)\b/gi, "")
    .trim();

  let person = remaining.replace(/[^a-zA-Z\s]/g, "").trim();
  if (!person) {
    // If expense item without person (e.g. "500 tea")
    if (description) {
      person = description;
    } else {
      person = "Expense";
    }
  }

  const formattedPerson = person
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  return {
    person: formattedPerson,
    amount,
    currency: "INR",
    type,
    description,
    date,
    originalText: clean,
  };
}
